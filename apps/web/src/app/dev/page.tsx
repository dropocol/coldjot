import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import TestDataManager from "./test-data-manager";

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
      <TestDataManager userId={session.user.id} />
    </div>
  );
}
