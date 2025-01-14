import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@/components/ui/separator";
import EditContactForm from "../../../../components/contacts/edit-contact-form";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const { id } = await params;
  try {
    const [contact, companies] = await Promise.all([
      prisma.contact.findFirst({
        where: {
          id: id,
          userId: session.user.id,
        },
        include: { company: true },
      }),
      prisma.company.findMany({
        where: { userId: session.user.id },
        orderBy: { name: "asc" },
      }),
    ]);

    if (!contact) {
      notFound();
    }

    return (
      <div className="max-w-7xl mx-auto py-8 space-y-6">
        <PageHeader
          title="Edit Contact"
          description="Update contact information and company association."
        />
        <Separator />
        <div className="max-w-3xl w-full">
          <EditContactForm contact={contact} companies={companies} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading contact:", error);
    notFound();
  }
}
