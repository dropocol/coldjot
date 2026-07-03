import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM field encryption for OAuth tokens stored at rest
 * (`Mailbox`/`Account` `access_token`, `refresh_token`, `id_token`).
 *
 * Design:
 * - Key is derived from `ENCRYPTION_KEY` via SHA-256, so any passphrase
 *   length/encoding (hex, base64, raw) yields a valid 32-byte key.
 * - Each value gets a fresh random 12-byte IV.
 * - Ciphertext is self-describing: `iv:tag:ct` (all base64), so `decrypt`
 *   needs no out-of-band metadata.
 * - `decrypt` falls back to plaintext for non-conforming values — this is the
 *   dual-read that lets the system keep working mid-migration. (For the wipe-
 *   and-relogin path we don't rely on it, but it costs nothing and makes a
 *   future backfill safe.)
 * - `ENCRYPTION_KEY_OLD` (optional) is tried when the primary key fails, so
 *   `ENCRYPTION_KEY` can be rotated without a hard cutover (decrypt with old,
 *   re-encrypt with new on next write).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSIONED_PREFIX = "enc1:"; // future-proofing: lets us change format later

function deriveKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase).digest();
}

function keys(): { current: Buffer | null; old: Buffer | null } {
  const current = process.env.ENCRYPTION_KEY;
  const old = process.env.ENCRYPTION_KEY_OLD;
  return {
    current: current ? deriveKey(current) : null,
    old: old ? deriveKey(old) : null,
  };
}

/** Encrypt a string. Returns null for null/undefined input (DB nullable cols). */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  const { current } = keys();
  if (!current) {
    throw new Error(
      "ENCRYPTION_KEY is not set — cannot encrypt OAuth token at rest"
    );
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, current, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    VERSIONED_PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(
      ":"
    )
  );
}

/** True if the value looks like output of `encrypt()` (so we don't double-encrypt). */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(VERSIONED_PREFIX);
}

/**
 * Decrypt a value produced by `encrypt()`. Falls back to plaintext passthrough
 * for non-conforming values (legacy / pre-migration rows). Returns null for
 * null/undefined.
 */
export function decrypt(payload: string | null | undefined): string | null {
  if (payload == null) return null;
  if (!payload.startsWith(VERSIONED_PREFIX)) {
    // Legacy plaintext — return as-is (dual-read during migration).
    return payload;
  }
  const body = payload.slice(VERSIONED_PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) {
    // Not our format; treat as plaintext to avoid breaking reads.
    return payload;
  }
  const [ivB, tagB, ctB] = parts;
  const { current, old } = keys();

  // Try the current key, then the old key (rotation window).
  for (const key of [current, old]) {
    if (!key) continue;
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivB, "base64")
      );
      decipher.setAuthTag(Buffer.from(tagB, "base64"));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(ctB, "base64")),
        decipher.final(),
      ]);
      return dec.toString("utf8");
    } catch {
      // Wrong key (or tampered) — try the next key.
    }
  }
  // Could not decrypt with any known key. Surface a clear error rather than
  // silently returning ciphertext, since callers would then send garbage to
  // Google and trigger spurious auth failures.
  throw new Error(
    "Failed to decrypt OAuth token: no matching ENCRYPTION_KEY / ENCRYPTION_KEY_OLD"
  );
}
