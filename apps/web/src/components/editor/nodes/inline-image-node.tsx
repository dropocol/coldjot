"use client";

import type { DOMConversionMap, DOMConversionOutput, NodeKey } from "lexical";
import { DecoratorNode } from "lexical";
import type { JSX } from "react";
import * as React from "react";
import Image from "next/image";

export interface InlineImagePayload {
  src: string;
  altText: string;
  width?: number;
  height?: number;
  showCaption?: boolean;
  caption?: string;
  key?: NodeKey;
}

export type SerializedInlineImageNode = Omit<InlineImagePayload, "key"> & {
  type: "inline-image";
  version: 1;
};

function convertInlineImageElement(domNode: Node): DOMConversionOutput | null {
  if (domNode instanceof HTMLImageElement) {
    const { src, alt: altText } = domNode;
    const node = $createInlineImageNode({ src, altText });
    return { node };
  }
  return null;
}

export class InlineImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: "inherit" | number;
  __height: "inherit" | number;
  __showCaption: boolean;
  __caption: string | undefined;

  static getType(): string {
    return "inline-image";
  }

  static clone(node: InlineImageNode): InlineImageNode {
    return new InlineImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__showCaption,
      node.__caption,
      node.__key
    );
  }

  static importJSON(
    serializedNode: SerializedInlineImageNode
  ): InlineImageNode {
    const { src, altText, width, height, showCaption, caption } =
      serializedNode;
    const node = $createInlineImageNode({
      src,
      altText,
      width,
      height,
      showCaption,
      caption,
    });
    return node;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: convertInlineImageElement,
        priority: 0,
      }),
    };
  }

  constructor(
    src: string,
    altText: string,
    width?: "inherit" | number,
    height?: "inherit" | number,
    showCaption?: boolean,
    caption?: string,
    key?: NodeKey
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width || "inherit";
    this.__height = height || "inherit";
    this.__showCaption = showCaption || false;
    this.__caption = caption;
  }

  exportJSON(): SerializedInlineImageNode {
    return {
      src: this.__src,
      altText: this.__altText,
      width: this.__width === "inherit" ? undefined : this.__width,
      height: this.__height === "inherit" ? undefined : this.__height,
      showCaption: this.__showCaption,
      caption: this.__caption,
      type: "inline-image",
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "inline-image";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <span className="inline-image">
        <Image
          src={this.__src}
          alt={this.__altText}
          width={this.__width === "inherit" ? 24 : this.__width}
          height={this.__height === "inherit" ? 24 : this.__height}
          className="inline-block align-middle mx-1"
          draggable={false}
        />
        {this.__showCaption && this.__caption && (
          <span className="text-xs text-muted-foreground ml-1">
            {this.__caption}
          </span>
        )}
      </span>
    );
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createInlineImageNode({
  src,
  altText,
  width,
  height,
  showCaption,
  caption,
  key,
}: InlineImagePayload): InlineImageNode {
  return new InlineImageNode(
    src,
    altText,
    width,
    height,
    showCaption,
    caption,
    key
  );
}

export function $isInlineImageNode(node: any): node is InlineImageNode {
  return node instanceof InlineImageNode;
}
