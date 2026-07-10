"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@coldjot/ui/components/card";
import { Button } from "@coldjot/ui/components/button";
import { signIn, signOut } from "next-auth/react";
import { CheckCircle2, XCircle } from "lucide-react";

type GoogleAccount = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  providerAccountId: string;
} | null;

export default function GoogleIntegration({ account }: { account: GoogleAccount }) {
  const isConnected = !!account?.access_token;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">Google Integration</h2>

      <Card>
        <CardHeader>
          <CardTitle>Gmail Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Connected to Gmail</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <span>Not connected to Gmail</span>
              </>
            )}
          </div>

          {isConnected ? (
            <Button variant="outline" onClick={() => signOut()}>
              Disconnect Gmail
            </Button>
          ) : (
            <Button onClick={() => signIn("google")}>Connect Gmail Account</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
