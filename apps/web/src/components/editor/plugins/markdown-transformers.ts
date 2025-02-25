import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import { $isParagraphNode } from "lexical";
import type { LexicalNode, TextNode } from "lexical";

export const TRANSFORMERS = [
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
  CHECK_LIST,
  {
    dependencies: [HorizontalRuleNode],
    export: (node: LexicalNode) => {
      return $isHorizontalRuleNode(node) ? "---" : null;
    },
    regExp: /^(---|\*\*\*|___)\s?$/,
    replace: (textNode: TextNode) => {
      const parent = textNode.getParent();
      if ($isParagraphNode(parent) && parent.getChildrenSize() === 1) {
        textNode.remove();
        parent.replace($createHorizontalRuleNode());
      }
    },
    type: "element",
  },
];
