import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { URL } from "url";

// Validate the audience URL using the built-in URL parser
function validateAudience(audience: string | undefined): string | undefined {
  if (!audience) return undefined;
  try {
    const url = new URL(audience);
    return url.toString();
  } catch (e) {
    console.warn("Invalid audience URL:", e);
    return undefined;
  }
}

const client = jwksClient({
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  cache: true,
  rateLimit: true,
  requestHeaders: {}, // Add empty headers to avoid punycode usage
});

export async function verifyPubSubJwt(token: string): Promise<boolean> {
  try {
    const decodedHeader = jwt.decode(token, { complete: true })?.header;
    if (!decodedHeader?.kid) {
      throw new Error("No key ID (kid) found in token header");
    }

    const key = await client.getSigningKey(decodedHeader.kid);
    const signingKey = key.getPublicKey();

    const audience = validateAudience(process.env.PUBSUB_AUDIENCE);

    const verified = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      audience,
    });

    return !!verified;
  } catch (error) {
    console.error("Failed to verify Pub/Sub JWT:", error);
    return false;
  }
}
