import { auth } from "@/auth";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/PageHeader";
import ApolloSearch from "@/components/search/apollo/apollo-search-component";
import { redirect } from "next/navigation";

export default async function ApolloPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // redirect page to contacts page if no templates are found
  if (process.env.NODE_ENV === "production") {
    return redirect("/");
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Apollo Search"
          description="Search for decision makers by company domain and enrich their contact information."
        />
        <Separator />
      </div>
      <ApolloSearch userId={session.user.id} />
    </div>
  );
}
