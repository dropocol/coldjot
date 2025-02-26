"use client";

import { useEffect } from "react";
import type { LexicalCommand } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodes, createCommand } from "lexical";
import {
  $createInlineImageNode,
  InlineImageNode,
} from "../../nodes/inline-image-node";
import type { InlineImagePayload } from "../../nodes/inline-image-node";

export type InsertInlineImagePayload = Readonly<InlineImagePayload>;

export const INSERT_INLINE_IMAGE_COMMAND: LexicalCommand<InsertInlineImagePayload> =
  createCommand("INSERT_INLINE_IMAGE_COMMAND");

export default function InlineImagePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([InlineImageNode])) {
      throw new Error(
        "InlineImagePlugin: InlineImageNode not registered on editor. Make sure to add InlineImageNode to the nodes array in your editor configuration."
      );
    }

    return editor.registerCommand<InsertInlineImagePayload>(
      INSERT_INLINE_IMAGE_COMMAND,
      (payload) => {
        const imageNode = $createInlineImageNode(payload);
        $insertNodes([imageNode]);
        return true;
      },
      0
    );
  }, [editor]);

  return null;
}
