import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default async function Login() {
  const session = await auth();

  // Redirect to home if already signed in
  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.svg" alt="Logo" className="size-8 w-auto" />
        </a>
        <LoginForm />
      </div>
    </div>
  );
}
