// Tests of the gate's own tools: `node --test "tools/*.test.mjs"` (a step of the gate, area docs).
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test } from 'node:test';

import { AGENT_PORTS, RESERVED_PORTS, isPortFree, pickPort } from './e2e-port.mjs';

/** A server on a port the system chose; resolves with the server once it listens. */
function listenOn(host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port: 0, host }, () => resolve(server));
  });
}
const close = (server) => new Promise((resolve) => server.close(resolve));

test('the pool is 4441–4449 and holds no reserved port', () => {
  assert.deepEqual([...AGENT_PORTS], [4441, 4442, 4443, 4444, 4445, 4446, 4447, 4448, 4449]);
  assert.deepEqual([...RESERVED_PORTS], [4420, 4430]);
  assert.equal(AGENT_PORTS.some((p) => RESERVED_PORTS.includes(p)), false);
});

test('pickPort takes the first free port of the pool and skips busy ones', async () => {
  assert.equal(await pickPort({ isFree: async () => true }), 4441);
  const busy = new Set([4441, 4442, 4444]);
  const asked = [];
  const port = await pickPort({
    isFree: async (p) => {
      asked.push(p);
      return !busy.has(p);
    },
  });
  assert.equal(port, 4443);
  assert.deepEqual(asked, [4441, 4442, 4443], 'ports are tried in order and the search stops at the first free one');
});

test('pickPort skips a port that a real server listens on', async () => {
  const taken = await listenOn('127.0.0.1');
  const spare = await listenOn('127.0.0.1');
  const [busyPort, freePort] = [taken.address().port, spare.address().port];
  await close(spare);
  try {
    assert.equal(await isPortFree(busyPort), false);
    assert.equal(await isPortFree(freePort), true);
    assert.equal(await pickPort({ pool: [busyPort, freePort] }), freePort);
  } finally {
    await close(taken);
  }
  assert.equal(await isPortFree(busyPort), true, 'free again once the server is closed');
});

test('pickPort fails when every port of the pool is busy', async () => {
  await assert.rejects(pickPort({ isFree: async () => false }), /brak wolnego portu e2e/);
  await assert.rejects(pickPort({ pool: [], isFree: async () => true }), /brak wolnego portu e2e/);
});

test('pickPort never returns 4420 or 4430', async () => {
  // asked for by E2E_PORT, as a number or as the text of the variable
  for (const requested of [4420, 4430, '4420', '4430', ' 4430 ']) {
    await assert.rejects(pickPort({ requested, isFree: async () => true }), /zarezerwowany/, `E2E_PORT=${requested}`);
  }
  // listed in the pool, even as the only free ports
  assert.equal(await pickPort({ pool: [4420, 4430, 4445], isFree: async () => true }), 4445);
  await assert.rejects(pickPort({ pool: [4420, 4430], isFree: async () => true }), /brak wolnego portu e2e/);
  const onlyReservedFree = async (p) => RESERVED_PORTS.includes(p);
  await assert.rejects(pickPort({ pool: [4420, 4441, 4430, 4442], isFree: onlyReservedFree }), /brak wolnego portu e2e/);
  // and whatever is free or busy, no result is ever a reserved port
  for (let mask = 0; mask < 1 << AGENT_PORTS.length; mask += 37) {
    const free = (p) => RESERVED_PORTS.includes(p) || ((mask >> AGENT_PORTS.indexOf(p)) & 1) === 1;
    const port = await pickPort({ pool: [4420, ...AGENT_PORTS, 4430], isFree: async (p) => free(p) }).catch(() => null);
    assert.equal(RESERVED_PORTS.includes(port), false, `mask ${mask}: ${port}`);
  }
});

test('pickPort takes E2E_PORT as given when it is a port outside the reserved ones', async () => {
  const never = async () => {
    throw new Error('a requested port is not probed');
  };
  assert.equal(await pickPort({ requested: '4445', isFree: never }), 4445);
  assert.equal(await pickPort({ requested: 5173, isFree: never }), 5173);
  // an empty variable is no request
  assert.equal(await pickPort({ requested: '', isFree: async () => true }), 4441);
  assert.equal(await pickPort({ requested: undefined, isFree: async () => true }), 4441);
  for (const requested of ['abc', '44x1', 0, -1, 65536, 4441.5, 'NaN']) {
    await assert.rejects(pickPort({ requested, isFree: never }), /nie jest numerem portu/, `E2E_PORT=${requested}`);
  }
});
