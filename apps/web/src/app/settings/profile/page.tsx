import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Separator } from "@/components/ui/separator";
import { SettingsMessageHandler } from "@/components/settings/settings-message-handler";
import { SettingsLayout } from "@/components/settings/settings-layout";
import ProfileSettings from "@/components/settings/profile-settings";
import EmailSettings from "@/components/settings/email-settings";
import GoogleIntegration from "@/components/settings/google-integration";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google",
    },
    select: {
      access_token: true,
      refresh_token: true,
      providerAccountId: true,
      expires_at: true,
    },
  });

  return (
    <SettingsLayout>
      <div className="space-y-8">
        <SettingsMessageHandler />

        <div>
          <h3 className="text-lg font-medium">Profile Settings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your profile settings and preferences.
          </p>
        </div>
        <Separator />

        <div className="space-y-10">
          <ProfileSettings user={session.user} />
          <Separator />

          {/* <EmailSettings /> */}
          {/* <Separator /> */}

          <GoogleIntegration account={account} />
        </div>
      </div>
    </SettingsLayout>
  );
}
