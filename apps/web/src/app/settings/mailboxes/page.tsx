import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@coldjot/database";
import { MailboxesSection } from "@/components/mailboxes/mailboxes-section";
import { SettingsLayout } from "@/components/settings/settings-layout";

export default async function MailboxesSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Fetch email accounts with aliases
  const accounts = await prisma.mailbox.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      aliases: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <SettingsLayout>
      <MailboxesSection initialAccounts={accounts} />
    </SettingsLayout>
  );
}
