import { EmailEditor } from "@/components/editor/email-editor";
import { redirect } from "next/navigation";
export default function EditorPage() {
  // redirect page to dashboard in production
  if (process.env.NODE_ENV === "production") {
    return redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      <EmailEditor />
    </div>
  );
}
