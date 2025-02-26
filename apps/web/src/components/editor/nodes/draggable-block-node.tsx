import {
  EditorConfig,
  ElementNode,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical";

export interface SerializedDraggableBlockNode extends SerializedElementNode {
  type: "draggable-block";
  version: 1;
}

export class DraggableBlockNode extends ElementNode {
  static getType(): string {
    return "draggable-block";
  }

  static clone(node: DraggableBlockNode): DraggableBlockNode {
    return new DraggableBlockNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    dom.className = config.theme.draggableBlock || "";
    dom.setAttribute("draggable", "true");
    dom.setAttribute("data-lexical-node-key", this.__key);
    dom.classList.add("draggable-block");
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(
    serializedNode: SerializedDraggableBlockNode
  ): DraggableBlockNode {
    return $createDraggableBlockNode();
  }

  exportJSON(): SerializedDraggableBlockNode {
    return {
      ...super.exportJSON(),
      type: "draggable-block",
      version: 1,
    };
  }

  insertNewAfter(selection: any, restoreSelection = true): null | LexicalNode {
    const newBlock = $createDraggableBlockNode();
    const direction = this.getDirection();
    newBlock.setDirection(direction);
    this.insertAfter(newBlock, restoreSelection);
    return newBlock;
  }

  collapseAtStart(): boolean {
    const paragraph = $createDraggableBlockNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    this.replace(paragraph);
    return true;
  }
}

export function $createDraggableBlockNode(): DraggableBlockNode {
  return new DraggableBlockNode();
}

export function $isDraggableBlockNode(
  node: LexicalNode | null | undefined
): node is DraggableBlockNode {
  return node instanceof DraggableBlockNode;
}
