"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { JSX } from "react";
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
import {
  Image as ImageIcon,
  Variable,
  SplitSquareVertical,
  Minus,
  Smile,
  Columns,
} from "lucide-react";
import { INSERT_IMAGE_COMMAND } from "./images-plugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "./horizontal-rule-plugin";

export const INSERT_COMPONENT_COMMAND = createCommand(
  "INSERT_COMPONENT_COMMAND"
);

const COMPONENTS = [
  {
    id: "image",
    name: "Image",
    description: "Add an image to your email",
    icon: <ImageIcon className="h-5 w-5" />,
  },
  {
    id: "variable",
    name: "Data Variable",
    description: "Insert dynamic content",
    icon: <Variable className="h-5 w-5" />,
  },
  {
    id: "button",
    name: "Button",
    description: "Add a call-to-action button",
    icon: <SplitSquareVertical className="h-5 w-5" />,
  },
  {
    id: "divider",
    name: "Horizontal Divider",
    description: "Add a horizontal line divider",
    icon: <Minus className="h-5 w-5" />,
  },
  {
    id: "icon",
    name: "Icon",
    description: "Add an icon to your email",
    icon: <Smile className="h-5 w-5" />,
  },
  {
    id: "columns",
    name: "Columns",
    description: "Create a multi-column layout",
    icon: <Columns className="h-5 w-5" />,
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
      // Handle different component types
      switch (componentId) {
        case "image":
          // Use the image plugin command
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            src: "https://source.unsplash.com/random/800x400?nature",
            altText: "Sample image",
            type: "image",
            version: 1,
          });
          break;
        case "divider":
          // Use the horizontal rule plugin command
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
          break;
        case "variable":
        case "button":
        case "icon":
        case "columns":
        default:
          // For other components, create a draggable block as a placeholder
          const root = $getRoot();
          const block = $createDraggableBlockNode();
          const paragraph = $createParagraphNode();
          paragraph.append(block);
          root.append(paragraph);
          break;
      }
    });
    setShowPicker(false);
    console.log(`Inserted component: ${componentId}`);
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
              <div className="text-2xl">{component.icon}</div>
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
