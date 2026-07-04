"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Navbar() {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  return (
    <nav className="bg-background shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold">Email Manager</span>
            </Link>

            {session && (
              <div className="ml-10 flex items-center space-x-4">
                <Link
                  href="/contacts"
                  className="text-foreground/70 hover:text-foreground"
                >
                  Contacts
                </Link>
                <Link
                  href="/templates"
                  className="text-foreground/70 hover:text-foreground"
                >
                  Templates
                </Link>
                <Link
                  href="/compose"
                  className="text-foreground/70 hover:text-foreground"
                >
                  Compose
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center">
            {loading ? (
              <div className="animate-pulse h-8 w-24 bg-muted rounded"></div>
            ) : session ? (
              <div className="flex items-center space-x-4">
                <span className="text-foreground/70">{session.user?.name}</span>
                <button
                  onClick={() => signOut()}
                  className="bg-destructive text-primary-foreground px-4 py-2 rounded-md hover:bg-destructive/90"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
              >
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
