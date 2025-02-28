"use client";

import { useState, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import {
  LexicalEditor,
  $getRoot,
  $createTextNode,
  $createParagraphNode,
} from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";
import { editorConfig } from "./editor-config";
import { EditorHeader } from "./components/editor-header";
import { EmailDetails } from "./components/email-details";
import { EditorToolbar } from "./components/editor-toolbar";
import { EditorContent } from "./components/editor-content";
import { EditorReference } from "./components/editor-reference";
import { EmailAnalysis } from "./components/email-analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Sample improved text for development
const SAMPLE_IMPROVED_TEXT = `Dear [Name],

I hope this email finds you well. I noticed an issue with your recent payment. The transaction from [Date] wasn't processed due to [Specific Reason].

To fix this:
1. Log in to your account
2. Go to Payment Settings
3. Update your payment method

Please complete this by [Date] to avoid service interruption. If you need help, reply to this email or call us at [Phone].

Thank you for your prompt attention to this matter.

Best regards,
[Your Name]`;

export function EmailEditor() {
  const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
  const USE_DEEPSEEK_API = true;

  // Email details state
  const [title, setTitle] = useState("Payment issue");
  const [editorContent, setEditorContent] = useState({ text: "", html: "" });

  // Editor state
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(
    null
  );
  const [activeTab, setActiveTab] = useState("design");
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();

  const handleEditorReference = (editor: LexicalEditor) => {
    setEditorInstance(editor);
  };

  // Update editor content for analysis
  useEffect(() => {
    if (editorInstance) {
      editorInstance.registerUpdateListener(({ editorState }) => {
        const stringifiedEditorState = JSON.stringify(editorState.toJSON());
        const parsedEditorState = editorInstance.parseEditorState(
          stringifiedEditorState
        );
        parsedEditorState.read(() => {
          const textContent = $getRoot().getTextContent();
          const htmlContent = $generateHtmlFromNodes(editorInstance);
          setEditorContent({
            text: textContent,
            html: htmlContent,
          });
        });
      });
    }
  }, [editorInstance]);

  // Function to improve email readability using API
  const improveReadability = async () => {
    if (!editorContent.text.trim()) {
      toast({
        title: "Empty Content",
        description: "Please write some content before improving readability.",
        variant: "destructive",
      });
      return;
    }

    setIsImproving(true);

    try {
      let improvedText = "";

      // Use sample text in development mode
      if (!IS_DEVELOPMENT && USE_DEEPSEEK_API) {
        const response = await fetch("/api/improve-readability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: editorContent.text }),
        });

        if (!response.ok) {
          throw new Error("Failed to improve readability");
        }
        const data = await response.json();
        improvedText = data.text;
      } else {
        improvedText = SAMPLE_IMPROVED_TEXT;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (editorInstance && improvedText) {
        editorInstance.update(() => {
          const root = $getRoot();
          root.clear();

          // Split the text into paragraphs
          const paragraphs = improvedText.split("\n\n");

          // Create paragraph nodes for each paragraph
          paragraphs.forEach((paragraph) => {
            if (paragraph.trim()) {
              const paragraphNode = $createParagraphNode();
              const textNode = $createTextNode(paragraph);
              paragraphNode.append(textNode);
              root.append(paragraphNode);
            }
          });
        });

        // Update the editor content state
        setEditorContent((prev) => ({
          ...prev,
          text: improvedText,
          html: improvedText, // This will be converted to proper HTML by the editor
        }));

        toast({
          title: "Success",
          description:
            "Email content has been improved for better readability.",
        });
      }
    } catch (error) {
      console.error("Error improving readability:", error);
      toast({
        title: "Error",
        description: "Failed to improve email readability. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImproving(false);
    }
  };

  return (
    <div className="flex flex-1 gap-0 min-h-screen">
      {/* Main Editor Section */}
      <div className="flex-1">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col"
        >
          {/* Header */}
          <EditorHeader
            title={title}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {/* Main Content */}
          <div className="mx-auto mt-6 px-8 w-full max-w-3xl">
            <div className="flex flex-col">
              {/* Tab Content */}
              <TabsContent value="design">
                {/* Email Details */}
                {/* <EmailDetails
                  fromName={fromName}
                  setFromName={setFromName}
                  fromEmail={fromEmail}
                  setFromEmail={setFromEmail}
                  replyTo={replyTo}
                  setReplyTo={setReplyTo}
                  subject={subject}
                  setSubject={setSubject}
                  previewText={previewText}
                  setPreviewText={setPreviewText}
                /> */}

                {/* Editor Toolbar */}
                <div className="flex items-center justify-between mb-4">
                  <EditorToolbar editorInstance={editorInstance} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={improveReadability}
                    disabled={isImproving}
                    className="gap-2 ml-4"
                  >
                    <Wand2 className="h-4 w-4" />
                    {isImproving ? "Improving..." : "Improve Readability"}
                  </Button>
                </div>

                {/* Editor */}
                <LexicalComposer initialConfig={editorConfig}>
                  <div className="editor-container">
                    <EditorReference onChange={handleEditorReference} />
                    <EditorContent />
                  </div>
                </LexicalComposer>
              </TabsContent>

              <TabsContent value="code">
                <div className="bg-white rounded-md shadow-sm border p-4 mb-6">
                  <p className="text-gray-500">Code view coming soon...</p>
                </div>
              </TabsContent>

              <TabsContent value="preview">
                <div className="bg-white rounded-md shadow-sm border p-4 mb-6">
                  <p className="text-gray-500">Preview coming soon...</p>
                </div>
              </TabsContent>

              <TabsContent value="settings">
                <div className="bg-white rounded-md shadow-sm border p-4 mb-6">
                  <p className="text-gray-500">Settings coming soon...</p>
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>

      {/* Analysis Panel */}
      <div className="w-[400px] border-l bg-white flex flex-col h-screen sticky top-0">
        <div className="flex-1 px-6 py-4 overflow-y-auto overflow-x-hidden">
          <EmailAnalysis content={editorContent} />
        </div>
      </div>
    </div>
  );
}
