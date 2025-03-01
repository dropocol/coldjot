"use client";

import { JSX } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
} from "lexical";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { $createDraggableBlockNode } from "../nodes/draggable-block-node";

export const INSERT_COMPONENT_COMMAND = createCommand(
  "INSERT_COMPONENT_COMMAND"
);

const COMPONENTS = [
  {
    id: "text",
    name: "Text Block",
    description: "A simple text block for content",
    icon: "📝",
  },
  {
    id: "image",
    name: "Image",
    description: "Add an image to your email",
    icon: "🖼️",
  },
  {
    id: "button",
    name: "Button",
    description: "Add a call-to-action button",
    icon: "🔘",
  },
  {
    id: "divider",
    name: "Divider",
    description: "Add a horizontal line divider",
    icon: "➖",
  },
  {
    id: "spacer",
    name: "Spacer",
    description: "Add vertical spacing",
    icon: "↕️",
  },
] as const;

export function ComponentPickerPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_COMPONENT_COMMAND,
      () => {
        setShowPicker(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  const insertComponent = (componentId: string) => {
    editor.update(() => {
      const root = $getRoot();
      const block = $createDraggableBlockNode();
      const paragraph = $createParagraphNode();
      paragraph.append(block);
      root.append(paragraph);
    });
    setShowPicker(false);
  };

  return (
    <Dialog open={showPicker} onOpenChange={setShowPicker}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert Component</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 p-4">
          {COMPONENTS.map((component) => (
            <Button
              key={component.id}
              variant="outline"
              className="h-auto flex-col gap-2 p-4"
              onClick={() => insertComponent(component.id)}
            >
              <span className="text-2xl">{component.icon}</span>
              <span className="font-medium">{component.name}</span>
              <span className="text-sm text-muted-foreground">
                {component.description}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
