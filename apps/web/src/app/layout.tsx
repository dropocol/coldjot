import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toaster";
import { toast, Toaster as HotToaster } from "react-hot-toast";
import { auth } from "@/auth";

import "./globals.css";
import { Providers } from "./providers";
import { QueryProvider } from "@/providers/query-provider";
import { LayoutContent } from "@/components/layout/layout-content";

export const metadata: Metadata = {
  title: "Email Template Manager",
  description: "Manage your email templates and drafts",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className={GeistSans.className}>
      <body>
        <Providers>
          <QueryProvider>
            <LayoutContent session={session}>{children}</LayoutContent>
            <Toaster />
          </QueryProvider>
        </Providers>
      </body>
    </html>
  );
}
