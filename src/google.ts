const encoder = new TextEncoder();

interface GoogleIdTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean | string;
  name?: string;
  picture?: string;
  exp: number;
  iat: number;
}

interface GoogleCert {
  kid: string;
  n: string;
  e: string;
  alg: string;
  kty: string;
  use: string;
}

interface GoogleCerts {
  keys: GoogleCert[];
}

let cachedCerts: { fetchedAt: number; certs: GoogleCerts } | null = null;
const CERTS_TTL_MS = 60 * 60 * 1000;

async function getGoogleCerts(): Promise<GoogleCerts> {
  if (cachedCerts && Date.now() - cachedCerts.fetchedAt < CERTS_TTL_MS) {
    return cachedCerts.certs;
  }
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('Failed to fetch Google certs');
  const certs = await r.json() as GoogleCerts;
  cachedCerts = { fetchedAt: Date.now(), certs };
  return certs;
}

function base64urlToUint8(b64url: string): Uint8Array {
  let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64urlDecodeString(b64url: string): string {
  let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

async function importRsaPublicKey(n: string, e: string): Promise<CryptoKey> {
  const jwk = { kty: 'RSA', n, e, alg: 'RS256', use: 'sig' } as JsonWebKey;
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string
): Promise<GoogleIdTokenPayload> {
  const [headerB64, payloadB64, sigB64] = idToken.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new Error('Malformed ID token');
  }

  const header = JSON.parse(base64urlDecodeString(headerB64));
  if (header.alg !== 'RS256') throw new Error('Unsupported alg');

  const certs = await getGoogleCerts();
  const cert = certs.keys.find(k => k.kid === header.kid);
  if (!cert) throw new Error('Signing key not found');

  const key = await importRsaPublicKey(cert.n, cert.e);
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const sig = base64urlToUint8(sigB64);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!ok) throw new Error('Invalid signature');

  const payload = JSON.parse(base64urlDecodeString(payloadB64)) as GoogleIdTokenPayload;
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp < now) throw new Error('Token expired');
  if (payload.iat > now + 60) throw new Error('Token iat in future');
  if (payload.aud !== expectedClientId) throw new Error('aud mismatch');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('iss mismatch');
  }
  if (!payload.email) throw new Error('email missing');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) throw new Error('Email not verified');

  return payload;
}

export function randomUsernameSuffix(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}
