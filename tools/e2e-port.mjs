// Port of the e2e dev server for the quality gate (plan 07 §3, plan 08 task E1-02).
//
// The human keeps his own `ng serve` on 4420 and the interior PoC on 4430. Playwright reuses a server
// that already listens on its port, so a gate on one of those ports would test whatever the human has
// running instead of its own tree. Agents take a port of their own pool.
import { connect, createServer } from 'node:net';

/** Never used by the gate. */
export const RESERVED_PORTS = Object.freeze([4420, 4430]);

/** The pool of autonomous agents: the gate takes the first free one. */
export const AGENT_PORTS = Object.freeze([4441, 4442, 4443, 4444, 4445, 4446, 4447, 4448, 4449]);

const LOOPBACK = ['127.0.0.1', '::1'];

/** true: bound and released; false: the port is taken; null: the address is not available on this machine. */
function canListen(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (e) => resolve(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? false : null));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** true when something accepts connections on the port. */
function answers(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Nothing listens on the port on either loopback address (a dev server binds `localhost`: IPv4 or IPv6). */
export async function isPortFree(port) {
  for (const host of LOOPBACK) {
    if (await answers(port, host)) return false;
    if ((await canListen(port, host)) === false) return false;
  }
  return true;
}

/**
 * The port for the e2e dev server.
 *
 * - `requested` (the E2E_PORT variable, when set): taken as given, unless it is a reserved port or
 *   not a port number; then it throws.
 * - otherwise the first free port of `pool`; throws when none is free.
 *
 * Never returns a reserved port, whatever the pool lists.
 */
export async function pickPort({ requested, pool = AGENT_PORTS, isFree = isPortFree } = {}) {
  if (requested !== undefined && requested !== null && String(requested).trim() !== '') {
    const port = Number(requested);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`E2E_PORT=${requested} nie jest numerem portu`);
    if (RESERVED_PORTS.includes(port)) {
      throw new Error(`E2E_PORT=${port} jest zarezerwowany dla człowieka (${RESERVED_PORTS.join(', ')}); wybierz port z puli ${pool[0]}–${pool.at(-1)}`);
    }
    return port;
  }
  const candidates = pool.filter((p) => !RESERVED_PORTS.includes(p));
  for (const port of candidates) {
    if (await isFree(port)) return port;
  }
  throw new Error(`brak wolnego portu e2e w puli ${candidates.join(', ')}; zatrzymaj własny serwer albo ustaw E2E_PORT`);
}
