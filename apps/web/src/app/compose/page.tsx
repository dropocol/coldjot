import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Separator } from "@/components/ui/separator";
import EmailComposer from "@/components/compose/email-composer";
import { redirect } from "next/navigation";

export default async function ComposePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const templates = await prisma.template.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      name: "asc",
    },
  });

  // redirect page to contacts page if no templates are found
  if (process.env.NODE_ENV === "production") {
    return redirect("/");
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compose Email</h1>
        <p className="text-muted-foreground">
          Create a new email using your templates and contacts.
        </p>
      </div>
      <Separator />
      <EmailComposer templates={templates} />
    </div>
  );
}
