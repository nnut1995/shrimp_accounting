// A form POST needs its same-origin Origin header for the CSRF check.
// no-referrer makes browsers send Origin: null, rejecting our own form.
export const setupHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};
export function validSetupRequest(req, port, nonce) {
  const host = `127.0.0.1:${port}`;
  return req.headers.host === host && req.url === `/${nonce}` &&
    (req.method !== 'POST' || req.headers.origin === `http://${host}`);
}
