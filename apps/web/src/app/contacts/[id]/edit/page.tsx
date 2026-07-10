import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import EditContactForm from "@/components/contacts/edit-contact-form";

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
    const [contact] = await Promise.all([
      prisma.contact.findFirst({
        where: {
          id: id,
          userId: session.user.id,
        },
      }),
    ]);

    if (!contact) {
      notFound();
    }

    return (
      <div className="max-w-5xl mx-auto py-8 space-y-6">
        <PageHeader
          title="Edit Contact"
          description="Update contact information and company association."
        />
        <div className="max-w-3xl w-full">
          <EditContactForm contact={contact} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading contact:", error);
    notFound();
  }
}
