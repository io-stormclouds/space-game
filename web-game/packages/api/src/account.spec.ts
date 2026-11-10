import { AccountError, currentSession, login, wsTicket } from './account';

// R-25: the HTTP API of accounts as the client sees it: JSON errors of the server, a proxy without
// the server behind it, and the guest account made when nobody is logged in.

type Call = { url: string; method: string; body?: string };

function fakeFetch(answers: Array<[number, unknown] | 'down'>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
    const a = answers.shift();
    if (!a || a === 'down') throw new TypeError('fetch failed');
    const [status, body] = a;
    return new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('accounts of the game server (R-25)', () => {
  it('logs in and reads the session; 401 is nobody', async () => {
    const me = { accountId: 'acc-1', callsign: 'Kestrel', guest: false };
    const { f, calls } = fakeFetch([[200, me], [200, me], [401, { error: 'nie zalogowano' }]]);
    await expect(login('Kestrel', 'tajne', '/api', f)).resolves.toEqual(me);
    expect(calls[0]).toEqual({ url: '/api/login', method: 'POST', body: '{"callsign":"Kestrel","password":"tajne"}' });
    await expect(currentSession('/api', f)).resolves.toEqual(me);
    await expect(currentSession('/api', f)).resolves.toBeNull();
  });

  it("passes the server's refusal on; a proxy without the server is status 0", async () => {
    const { f } = fakeFetch([[401, { error: 'błędny kod dostępu' }], [502, 'Bad Gateway'], 'down']);
    await expect(login('Kestrel', 'zle', '/api', f)).rejects.toEqual(new AccountError('błędny kod dostępu', 401));
    await expect(login('Kestrel', 'x', '/api', f)).rejects.toEqual(new AccountError('serwer gry niedostępny (HTTP 502)', 0));
    await expect(login('Kestrel', 'x', '/api', f)).rejects.toEqual(new AccountError('serwer gry niedostępny', 0));
  });

  it('gets a ticket, making a guest account first when nobody is logged in', async () => {
    const { f, calls } = fakeFetch([
      [200, { ticket: 't-1' }],
      [401, { error: 'nie zalogowano' }],
      [200, { accountId: 'acc-2', callsign: 'gosc-abc', guest: true }],
      [200, { ticket: 't-2' }],
      [401, { error: 'nie zalogowano' }],
    ]);
    await expect(wsTicket('/api', true, f)).resolves.toBe('t-1');
    await expect(wsTicket('/api', true, f)).resolves.toBe('t-2');
    expect(calls.map((c) => c.url)).toEqual(['/api/ticket', '/api/ticket', '/api/guest', '/api/ticket']);
    // without the guest fallback the 401 is the answer
    await expect(wsTicket('/api', false, f)).rejects.toMatchObject({ status: 401 });
  });
});
