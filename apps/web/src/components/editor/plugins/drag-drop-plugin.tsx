"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getNodeByKey,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  LexicalCommand,
  NodeKey,
} from "lexical";
import { useEffect } from "react";

export const REORDER_NODES_COMMAND: LexicalCommand<{
  fromKey: NodeKey;
  toKey: NodeKey;
}> = createCommand("REORDER_NODES_COMMAND");

export function DragDropPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      REORDER_NODES_COMMAND,
      ({ fromKey, toKey }) => {
        editor.update(() => {
          const fromNode = $getNodeByKey(fromKey);
          const toNode = $getNodeByKey(toKey);

          if (!fromNode || !toNode) {
            return false;
          }

          const root = $getRoot();
          const fromIndex = fromNode.getIndexWithinParent();
          const toIndex = toNode.getIndexWithinParent();

          // Remove the node from its current position
          root.splice(fromIndex, 1, []);

          // Insert it at the new position
          root.splice(toIndex, 0, [fromNode]);

          return true;
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
