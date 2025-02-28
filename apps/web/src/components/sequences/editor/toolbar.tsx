"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  $getSelection,
  $isRangeSelection,
  ElementFormatType,
  $createParagraphNode,
  $getNodeByKey,
  RangeSelection,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Code,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Image,
  Code2,
  Grip,
  Star,
  Minus,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { INSERT_COMPONENT_COMMAND } from "@/components/editor/plugins/component-picker-plugin";
import { Button } from "@/components/ui/button";

const blockTypeToBlockName = {
  paragraph: "Normal",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
} as const;

export function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] =
    useState<keyof typeof blockTypeToBlockName>("paragraph");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [activeStyles, setActiveStyles] = useState(new Set<string>());

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const rangeSelection = selection as RangeSelection;
      const styles = new Set<string>();
      if (rangeSelection.hasFormat("bold")) styles.add("bold");
      if (rangeSelection.hasFormat("italic")) styles.add("italic");
      if (rangeSelection.hasFormat("underline")) styles.add("underline");
      setActiveStyles(styles);
      setIsEditorFocused(!rangeSelection.isCollapsed());
    } else {
      setIsEditorFocused(false);
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor]);

  const formatHeading = (headingSize: keyof typeof blockTypeToBlockName) => {
    if (headingSize === "paragraph") {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode());
        }
      });
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize));
        }
      });
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Select
        value={blockType}
        onValueChange={(value) =>
          formatHeading(value as keyof typeof blockTypeToBlockName)
        }
      >
        <SelectTrigger className="h-8 w-[120px] text-sm">
          <SelectValue>{blockTypeToBlockName[blockType]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(blockTypeToBlockName).map(([type, name]) => (
            <SelectItem key={type} value={type}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={activeStyles.has("bold")}
          onPressedChange={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
          }
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeStyles.has("italic")}
          onPressedChange={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
          }
        >
          <Italic className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeStyles.has("underline")}
          onPressedChange={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
          }
        >
          <Underline className="h-4 w-4" />
        </Toggle>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")
          }
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")
          }
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.dispatchCommand(INSERT_COMPONENT_COMMAND, undefined)
          }
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
