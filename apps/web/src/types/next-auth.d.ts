import NextAuth from "next-auth";

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
