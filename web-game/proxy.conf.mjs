// Proxy of the dev server (R-25): the game server's HTTP API and WebSocket on the page's origin, as
// behind Caddy in deploy/, so the session cookie is first-party and `SameSite=Strict` holds.
// GAME_SERVER: where the game server listens (default http://127.0.0.1:8080). The Host header stays
// the page's (the server refuses requests whose Origin is another host).
const target = process.env['GAME_SERVER'] ?? 'http://127.0.0.1:8080';

export default {
  '/api': { target, changeOrigin: false, secure: false },
  '/ws': { target, ws: true, changeOrigin: false, secure: false },
};
