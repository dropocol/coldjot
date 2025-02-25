"use client";

import { SessionProvider } from "next-auth/react";
import { toast, Toaster as HotToaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HotToaster position="bottom-right" />
      {children}
    </SessionProvider>
  );
}
