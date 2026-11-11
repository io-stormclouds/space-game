// Accounts and sessions of the game server (plan 02 §8, R-25): HTTP JSON on the page's origin (Caddy in
// deploy/, the dev server's proxy in development), the session in an HttpOnly cookie the page never
// sees. The WebSocket logs in with a one-time ticket of that cookie, so no password stays in the browser.

/** Base path of the HTTP API of accounts on the page's origin. */
export const SESSION_API = '/api';

/** Who is logged in. */
export interface AccountSession {
  accountId: string;
  callsign: string;
  /** A guest account: a random callsign, reached only through this browser's cookie. */
  guest: boolean;
}

/** A refusal of the server (`status` 400 bad input, 401, 403 switched off, 409 taken, 429 limits) or no server (`status` 0). */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

type Fetch = typeof fetch;

const UNREACHABLE = 'serwer gry niedostępny';

async function call<T>(base: string, path: string, method: 'GET' | 'POST', body?: unknown, f: Fetch = fetch): Promise<T> {
  let r: Response;
  try {
    r = await f(`${base}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AccountError(UNREACHABLE, 0);
  }
  if (r.status === 204) return undefined as T;
  const json = (r.headers.get('content-type') ?? '').includes('application/json') ? ((await r.json()) as Record<string, unknown>) : null;
  if (!r.ok) {
    // a proxy without the server answers 5xx without our JSON
    const error = typeof json?.['error'] === 'string' ? json['error'] : `${UNREACHABLE} (HTTP ${r.status})`;
    throw new AccountError(error, json ? r.status : 0);
  }
  return json as T;
}

/** The session of this browser, or null when nobody is logged in. */
export async function currentSession(base = SESSION_API, f?: Fetch): Promise<AccountSession | null> {
  try {
    return await call<AccountSession>(base, '/session', 'GET', undefined, f);
  } catch (e) {
    if (e instanceof AccountError && e.status === 401) return null;
    throw e;
  }
}

export const login = (callsign: string, password: string, base = SESSION_API, f?: Fetch) =>
  call<AccountSession>(base, '/login', 'POST', { callsign, password }, f);

export const register = (callsign: string, password: string, base = SESSION_API, f?: Fetch) =>
  call<AccountSession>(base, '/register', 'POST', { callsign, password }, f);

/** A guest account (where the server allows them), logged in. */
export const playAsGuest = (base = SESSION_API, f?: Fetch) => call<AccountSession>(base, '/guest', 'POST', {}, f);

export const logout = (base = SESSION_API, f?: Fetch) => call<void>(base, '/logout', 'POST', {}, f);

/**
 * A one-time ticket for the WebSocket hello. Without a session and with `guest`, a guest account is
 * made first (where the server allows it); otherwise the 401 is thrown.
 */
export async function wsTicket(base = SESSION_API, guest = false, f?: Fetch): Promise<string> {
  try {
    return (await call<{ ticket: string }>(base, '/ticket', 'POST', {}, f)).ticket;
  } catch (e) {
    if (!(guest && e instanceof AccountError && e.status === 401)) throw e;
  }
  await playAsGuest(base, f);
  return (await call<{ ticket: string }>(base, '/ticket', 'POST', {}, f)).ticket;
}
