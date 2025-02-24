import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Redirect to the profile settings page
  redirect("/settings/profile");
}
