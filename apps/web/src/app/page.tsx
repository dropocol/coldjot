"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mail, LogIn, Users, FileText, Building2 } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div className="flex flex-col items-center gap-4 mb-12">
        <Mail className="h-12 w-12 text-blue-600" />
        <h1 className="text-5xl font-bold">Email Template Manager</h1>
      </div>

      {session ? (
        <div className="space-y-8 w-full max-w-lg">
          <Link href="/compose">
            <Button
              className="w-full h-14 text-lg shadow-sm hover:shadow-md transition-all"
              size="lg"
            >
              <Mail className="mr-3 h-6 w-6" />
              Compose New Email
            </Button>
          </Link>
          <div className="grid grid-cols-2 gap-6">
            <Link href="/contacts" className="w-full">
              <Button
                variant="outline"
                className="w-full h-14 text-lg shadow-sm hover:shadow-md transition-all"
                size="lg"
              >
                <Users className="mr-3 h-6 w-6" />
                Manage Contacts
              </Button>
            </Link>
            <Link href="/templates" className="w-full">
              <Button
                variant="outline"
                className="w-full h-14 text-lg shadow-sm hover:shadow-md transition-all"
                size="lg"
              >
                <FileText className="mr-3 h-6 w-6" />
                Manage Templates
              </Button>
            </Link>
            <Link href="/companies" className="w-full">
              <Button
                variant="outline"
                className="w-full h-14 text-lg shadow-sm hover:shadow-md transition-all"
                size="lg"
              >
                <Building2 className="mr-3 h-6 w-6" />
                Manage Companies
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="text-center flex flex-col items-center space-y-8">
          <p className="text-xl text-gray-600 max-w-lg">
            Create, manage, and send email templates with ease. Sign in to get
            started.
          </p>
          <Button
            onClick={() => signIn("google")}
            className="h-14 px-8 text-lg font-medium bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 shadow-sm hover:shadow-md transition-all flex items-center gap-3"
            size="lg"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </Button>
        </div>
      )}
    </div>
  );
}