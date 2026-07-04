import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@coldjot/ui/components/separator";
import TestDataManager from "./TestDataManager";

export default async function DevPage() {
  // Only allow access in development
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <PageHeader
        title="Development Tools"
        description="Manage test data for development purposes."
      />
      <Separator />
      <TestDataManager userId={session.user.id} />
    </div>
  );
}
