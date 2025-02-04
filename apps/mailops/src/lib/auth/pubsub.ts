import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { URL } from "url";
import { logger } from "@/lib/log";
import { PUBSUB_CONFIG } from "@/config/pubsub/constants";

// Validate the audience URL using the built-in URL parser
function validateAudience(audience: string | undefined): string | undefined {
  if (!audience) return undefined;
  try {
    const url = new URL(audience);
    return url.toString();
  } catch (e) {
    logger.warn("Invalid audience URL:", e);
    return undefined;
  }
}

// Initialize JWKS client for Google's public keys
const client = jwksClient({
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  cache: true,
  rateLimit: true,
  requestHeaders: {}, // Add empty headers to avoid punycode usage
});

interface JWTPayload {
  email?: string;
  email_verified?: boolean;
  aud?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  sub?: string;
}

/**
 * Verify a JWT token from Google PubSub
 * @param token The JWT token to verify
 * @returns Promise<boolean> True if the token is valid
 */
export async function verifyPubSubJwt(token: string): Promise<boolean> {
  try {
    logger.info("🔒 Verifying Pub/Sub JWT...");

    // Decode the header to get the key ID
    const decodedHeader = jwt.decode(token, { complete: true })?.header;
    if (!decodedHeader?.kid) {
      throw new Error("No key ID (kid) found in token header");
    }

    // Get the signing key from Google's JWKS
    const key = await client.getSigningKey(decodedHeader.kid);
    const signingKey = key.getPublicKey();

    // Validate the audience URL
    const audience = validateAudience(PUBSUB_CONFIG.JWT.AUDIENCE);
    if (!audience) {
      throw new Error("Invalid audience URL configuration");
    }

    // Convert readonly array to mutable array for jwt.verify
    const algorithms = [...PUBSUB_CONFIG.JWT.ALGORITHMS];

    // Verify the token
    const verified = jwt.verify(token, signingKey, {
      algorithms,
      audience,
      issuer: PUBSUB_CONFIG.JWT.ISSUER,
    }) as JWTPayload;

    // Additional validation if needed
    if (!verified.email || !verified.email_verified) {
      logger.warn("JWT missing required claims", { verified });
      return false;
    }

    logger.info("✅ JWT verification successful");
    return true;
  } catch (error) {
    logger.error({ error }, "❌ Failed to verify Pub/Sub JWT");
    return false;
  }
}

/**
 * Extract email from a verified JWT token
 * @param token The verified JWT token
 * @returns string | null The email address or null if not found
 */
export function extractEmailFromJwt(token: string): string | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded.email || null;
  } catch (error) {
    logger.error({ error }, "Failed to extract email from JWT");
    return null;
  }
}
