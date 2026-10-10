/**
 * Minimal signed-cookie session.
 *
 * This is an internal tool for one company, so phase 1 uses a single shared
 * password (APP_PASSWORD). After a correct login the server sets a cookie
 * holding an expiry time plus an HMAC signature of it. Nobody can forge or
 * extend the cookie without SESSION_SECRET.
 *
 * Swap this for SSO (Auth.js with Google / Microsoft) when more people than
 * the CEO and their office need access.
 *
 * Uses only Web Crypto, so it works in the proxy (src/proxy.ts) and in route
 * handlers alike. It deliberately does not import `env` so the proxy stays light.
 */

export const SESSION_COOKIE = "ea_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // two weeks

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Compare two strings in constant time, so timing doesn't leak how much matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Create a new session token valid for SESSION_MAX_AGE_SECONDS. */
export async function createSessionToken(secret: string): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${await sign(expiresAt, secret)}`;
}

/** True if the token was signed with `secret` and hasn't expired. */
export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;
  return safeEqual(signature, await sign(expiresAt, secret));
}
