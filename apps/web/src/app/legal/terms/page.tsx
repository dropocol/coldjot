import { Metadata } from "next";
import { readFileSync } from "fs";

import ReactMarkdown from "react-markdown";

export const metadata: Metadata = {
  title: "Terms of Service | ColdJot",
  description: "Terms of service and usage agreement for ColdJot",
};

export default function TermsPage() {
  // Read the markdown file
  const markdownContent = readFileSync(
    "./src/app/legal/terms/terms.md",
    "utf-8"
  );

  return (
    <div className="container max-w-3xl py-8 mx-auto prose dark:prose-invert">
      <ReactMarkdown>{markdownContent}</ReactMarkdown>
    </div>
  );
}
