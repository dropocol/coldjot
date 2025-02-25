import { EmailEditor } from "@/components/editor/email-editor";

export default function EditorPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Email Editor</h1>
        <p className="text-muted-foreground">
          Create and customize your email template
        </p>
      </div>
      <EmailEditor />
    </div>
  );
}
