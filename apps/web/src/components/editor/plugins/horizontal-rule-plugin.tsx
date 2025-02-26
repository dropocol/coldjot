"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
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

        if ($isRangeSelection(selection)) {
          const focusNode = selection.focus.getNode();
          if (focusNode !== null) {
            const horizontalRuleNode = $createHorizontalRuleNode();
            selection.insertParagraph();
            selection.focus
              .getNode()
              .getTopLevelElementOrThrow()
              .insertBefore(horizontalRuleNode);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
