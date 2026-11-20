import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const cookieName = 'signage_admin';
const secret = () => process.env.SIGNAGE_SECRET;
const key = () => new TextEncoder().encode(secret());
export const configured = () => secret()?.length >= 32 && process.env.SIGNAGE_PASSWORD?.length >= 16;

export function equals(a, b) {
  const digest = value => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function screenKey(id) {
  return createHmac('sha256', secret()).update('player:' + id).digest('base64url');
}

export function playerAllowed(req, id) {
  return configured() && equals(req.headers.get('authorization'), 'Bearer ' + screenKey(id));
}

export async function adminAllowed() {
  if (!configured()) return false;
  try {
    const token = (await cookies()).get(cookieName)?.value;
    await jwtVerify(token, key(), { algorithms: ['HS256'], audience: 'signage-admin' });
    return true;
  } catch {
    return false;
  }
}

export async function adminToken() {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setAudience('signage-admin')
    .setIssuedAt().setExpirationTime('8h').sign(key());
}

export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host || req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const protocol = process.env.VERCEL === '1' ? 'https:' : new URL(req.url).protocol;
  return origin === protocol + '//' + host;
}

