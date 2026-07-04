import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";

import "./globals.css";
import "./app.css";
import { Toaster } from "@coldjot/ui/components/toaster";
import { cn } from "@coldjot/ui/lib/utils";

import { auth } from "@/auth";

import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "./providers";
import { QueryProvider } from "@/providers/query-provider";
import { LayoutContent } from "@/components/layout/layout-content";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <Providers>
            <QueryProvider>
              <LayoutContent session={session}>{children}</LayoutContent>
              <Toaster />
            </QueryProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
