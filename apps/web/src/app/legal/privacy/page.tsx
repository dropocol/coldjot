import { Metadata } from "next";
import { readFileSync } from "fs";

import ReactMarkdown from "react-markdown";

export const metadata: Metadata = {
  title: "Privacy Policy | ColdJot",
  description: "Privacy policy and data handling practices for ColdJot",
};

export default function PrivacyPage() {
  // Read the markdown file
  const markdownContent = readFileSync(
    "./src/app/legal/privacy/privacy.md",
    "utf-8"
  );

  return (
    <div className="container max-w-3xl py-8 mx-auto prose dark:prose-invert">
      <ReactMarkdown>{markdownContent}</ReactMarkdown>
    </div>
  );
}
