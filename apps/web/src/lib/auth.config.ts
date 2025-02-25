import type { NextAuthConfig } from "next-auth";
import type { DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import {
  findGoogleAccount,
  updateGoogleAccount,
  findUserGoogleAccounts,
  refreshGoogleToken,
} from "@/lib/db/user";
import { PrismaClient } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
    user: {
      id: string;
      role: string;
      onboardingCompleted: boolean;
      onboardingStep: number;
    } & DefaultSession["user"];
  }
}

const prisma = new PrismaClient();

export const authConfig: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // ux_mode: "popup",
          access_type: "offline",
          prompt: "consent",
          scope: [
            // https://developers.google.com/gmail/api/auth/scopes
            // "openid email profile",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
            // "https://mail.google.com/", // Required for SMTP access
            // "https://www.googleapis.com/auth/gmail.send",
            // "https://www.googleapis.com/auth/gmail.modify",
            // "https://www.googleapis.com/auth/gmail.compose",
            // "https://www.googleapis.com/auth/gmail.metadata",
            // "https://www.googleapis.com/auth/gmail.readonly",
            // "https://www.googleapis.com/auth/pubsub",
          ].join(" "),
        },
      },
      // profile(profile) {
      //   return { role: profile.role ?? "user", ...profile };
      // },
    }),
  ],
  trustHost: true,

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && account.access_token) {
        try {
          console.log("🚀 Signing in with Google...");
          console.log(user, account, profile);

          // const existingAccount = await findGoogleAccount(user.sub!);
          const existingAccount = await findGoogleAccount(
            account.providerAccountId
          );

          if (existingAccount) {
            await updateGoogleAccount(account.providerAccountId, {
              access_token: account.access_token,
              expires_at: account.expires_at!,
              ...(account.refresh_token && {
                refresh_token: account.refresh_token,
              }),
            });

            console.log("updatedAccount");
            return true;
          } else {
            if (!user.id) return false;
          }
        } catch (error) {
          console.error("Failed to setup Gmail watch:", error);
        }
      }
      return true;
    },

    async session({ session, user, token }) {
      // Get user's onboarding status
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          onboardingCompleted: true,
          onboardingStep: true,
        },
      });

      // Add onboarding status to session
      session.user.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
      session.user.onboardingStep = dbUser?.onboardingStep ?? 0;
      session.user.role = dbUser?.role ?? "user";
      session.user.id = user.id;

      // Handle Google account refresh token
      const googleAccounts = await findUserGoogleAccounts(user.id);
      const [googleAccount] = googleAccounts;

      if (
        googleAccount &&
        googleAccount.expires_at &&
        googleAccount.expires_at * 1000 < Date.now()
      ) {
        // If the access token has expired, try to refresh it
        try {
          if (!googleAccount.refresh_token) {
            throw new Error("No refresh token available");
          }

          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: "refresh_token",
              refresh_token: googleAccount.refresh_token!,
            }),
          });

          const tokensOrError = await response.json();

          if (!response.ok) throw tokensOrError;

          const newTokens = tokensOrError as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
          };

          const existingAccount = await findGoogleAccount(
            googleAccount.providerAccountId
          );

          if (existingAccount) {
            await refreshGoogleToken(existingAccount, {
              access_token: newTokens.access_token,
              expires_at: newTokens.expires_in,
              ...(newTokens.refresh_token && {
                refresh_token: newTokens.refresh_token,
              }),
            });
          }

          session.user.role = user.role ? user.role : "user";

          return session;
        } catch (error) {
          console.error("Error refreshing access_token", error);
          // If we fail to refresh the token, return an error so we can handle it on the page
          session.error = "RefreshTokenError";
        }
      }

      return session;
    },

    async jwt({ token, account, profile }) {
      console.log("jwt", token, account, profile);

      if (!account) return token;

      if (account?.access_token) {
        token.access_token = account.access_token;
        token.expires_at = account.expires_at;

        if (account.refresh_token) {
          token.refresh_token = account.refresh_token;
          const existingAccount = await findGoogleAccount(
            account.providerAccountId
          );

          if (existingAccount) {
            await updateGoogleAccount(account.providerAccountId, {
              access_token: account.access_token,
              expires_at: account.expires_at!,
              refresh_token: account.refresh_token,
            });
          }
        }
      }
      return token;
    },
  },
  pages: {
    signIn: "/signin",
  },
  // debug: process.env.NODE_ENV === "development",
};
