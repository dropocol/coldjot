"use client";

import type { JSX } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  $createParagraphNode,
  $insertNodes,
} from "lexical";
import { $createHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { useEffect } from "react";

export const INSERT_HORIZONTAL_RULE_COMMAND = createCommand(
  "INSERT_HORIZONTAL_RULE_COMMAND"
);

export function HorizontalRulePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        const horizontalRuleNode = $createHorizontalRuleNode();
        const paragraphNode = $createParagraphNode();

        selection.insertNodes([horizontalRuleNode, paragraphNode]);
        paragraphNode.select();

        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
