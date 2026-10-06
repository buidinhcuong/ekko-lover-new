/**
 * Compact signed tokens (JWT-compatible HS256) used for two things:
 *  - the SSO handoff token the Ekko app mints for this feature
 *  - the session cookie this service issues after accepting that handoff
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function issue(payload, secret, ttlSeconds = 60 * 60 * 24 * 30) {
  const now = Math.floor(Date.now() / 1000);
  const body = { jti: randomUUID(), iat: now, exp: now + ttlSeconds, ...payload };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify(body));
  return `${head}.${claims}.${sign(`${head}.${claims}`, secret)}`;
}

/** Returns the claims, or throws with a reason the caller can surface. */
export function verify(token, secret) {
  if (typeof token !== 'string') throw new Error('Token rong');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token sai dinh dang');
  const [head, claims, sig] = parts;

  const expected = Buffer.from(sign(`${head}.${claims}`, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Chu ky token khong hop le');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Noi dung token khong hop le');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) throw new Error('Token da het han');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new Error('Token chua co hieu luc');
  return payload;
}
