import { prisma } from "@coldjot/database";
import type { Account } from "@prisma/client";

interface _GoogleTokens {
  access_token: string;
  expires_at: number;
  refresh_token: string;
}

interface RefreshGoogleTokens {
  access_token: string;
  expires_at: number;
  refresh_token?: string;
}

export async function findGoogleAccount(
  providerAccountId: string
): Promise<Account | null> {
  return prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId,
      },
    },
  });
}

export async function updateGoogleAccount(
  providerAccountId: string,
  data: RefreshGoogleTokens
): Promise<Account> {
  return prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId,
      },
    },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_at,
      ...(data.refresh_token && { refresh_token: data.refresh_token }),
    },
  });
}

export async function findUserGoogleAccounts(
  userId: string
): Promise<Account[]> {
  return prisma.account.findMany({
    where: {
      userId,
      provider: "google",
    },
  });
}

export async function refreshGoogleToken(
  account: Account,
  newTokens: RefreshGoogleTokens
): Promise<Account> {
  return prisma.account.update({
    data: {
      access_token: newTokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_at),
      ...(newTokens.refresh_token && {
        refresh_token: newTokens.refresh_token,
      }),
    },
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
  });
}
