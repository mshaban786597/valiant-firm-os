import crypto from "node:crypto";

/**
 * Encrypt small secrets (OAuth tokens) before they are stored in the database.
 * AES-256-GCM with a key derived from the app secret, so a database dump alone
 * does not reveal a token. Server only.
 */
function keyFrom(secret: string | undefined): Buffer {
  if (!secret || secret.length < 16) throw new Error("App secret is not configured (NEXTAUTH_SECRET)");
  return crypto.createHash("sha256").update(`vf-seal:v1:${secret}`).digest();
}

const appSecret = (env: Record<string, string | undefined>) => env.NEXTAUTH_SECRET || env.AUTH_SECRET;

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function seal(plain: string, env: Record<string, string | undefined> = process.env): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(appSecret(env)), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** Returns null when the value is missing, was tampered with, or the app secret changed. */
export function open(sealed: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!sealed) return null;
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(appSecret(env)), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
