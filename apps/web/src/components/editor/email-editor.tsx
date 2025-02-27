"use client";

import { useState, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalEditor, $getRoot } from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";
import { editorConfig } from "./editor-config";
import { EditorHeader } from "./components/editor-header";
import { EmailDetails } from "./components/email-details";
import { EditorToolbar } from "./components/editor-toolbar";
import { EditorContent } from "./components/editor-content";
import { EditorReference } from "./components/editor-reference";
import { EmailAnalysis } from "./components/email-analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function EmailEditor() {
  // Email details state
  const [title, setTitle] = useState("Payment issue");
  const [editorContent, setEditorContent] = useState({ text: "", html: "" });

  // Editor state
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(
    null
  );
  const [activeTab, setActiveTab] = useState("design");

  const handleEditorReference = (editor: LexicalEditor) => {
    setEditorInstance(editor);
  };

  // Update editor content for analysis
  useEffect(() => {
    if (editorInstance) {
      editorInstance.registerUpdateListener(({ editorState }) => {
        // Get the stringified state
        const stringifiedEditorState = JSON.stringify(editorState.toJSON());

        // Parse it back to get a clean state
        const parsedEditorState = editorInstance.parseEditorState(
          stringifiedEditorState
        );

        // Read the content
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
                <EditorToolbar editorInstance={editorInstance} />

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
