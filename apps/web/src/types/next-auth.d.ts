// Side-effect import: ensures next-auth's base types are loaded so the
// module augmentation below merges correctly.
import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      role?: string;
    };
  }

  interface User {
    role?: string;
    sub?: string;
  }
}
