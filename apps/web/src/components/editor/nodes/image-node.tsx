"use client";

import type { JSX } from "react";
import { DecoratorNode, SerializedLexicalNode, Spread } from "lexical";
import * as React from "react";
import Image from "next/image";

export interface ImagePayload
  extends Spread<
    {
      src: string;
      altText: string;
      caption?: string;
      width?: number;
      height?: number;
      maxWidth?: number;
      showCaption?: boolean;
      key?: string;
    },
    SerializedLexicalNode
  > {
  type: "image";
  version: 1;
}

function convertImageElement(
  domNode: Node
): null | undefined | { src: string; altText: string } {
  if (domNode instanceof HTMLImageElement) {
    return {
      src: domNode.src,
      altText: domNode.alt,
    };
  }
  return null;
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | undefined;
  __height: number | undefined;
  __maxWidth: number | undefined;
  __showCaption: boolean;
  __caption: string | undefined;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__maxWidth,
      node.__showCaption,
      node.__caption,
      node.__key
    );
  }

  static importJSON(serializedNode: ImagePayload): ImageNode {
    const { src, altText, width, height, maxWidth, caption, showCaption } =
      serializedNode;
    const node = $createImageNode({
      src,
      altText,
      width,
      height,
      maxWidth,
      showCaption,
      caption,
    });
    return node;
  }

  exportJSON(): ImagePayload {
    return {
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      maxWidth: this.__maxWidth,
      caption: this.__caption,
      showCaption: this.__showCaption,
      type: "image",
      version: 1,
    };
  }

  constructor(
    src: string,
    altText: string,
    width?: number,
    height?: number,
    maxWidth?: number,
    showCaption?: boolean,
    caption?: string,
    key?: string
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
    this.__maxWidth = maxWidth;
    this.__showCaption = showCaption ?? false;
    this.__caption = caption;
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "relative";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <div className="relative">
        <div className="image-container">
          <Image
            src={this.__src}
            alt={this.__altText}
            width={this.__width || 800}
            height={this.__height || 600}
            className="max-w-full h-auto rounded-lg"
            priority
          />
        </div>
        {this.__showCaption && this.__caption && (
          <div className="text-center text-sm text-muted-foreground mt-2">
            {this.__caption}
          </div>
        )}
      </div>
    );
  }

  isInline(): boolean {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createImageNode({
  src,
  altText,
  width,
  height,
  maxWidth,
  showCaption,
  caption,
  key,
}: Partial<ImagePayload> & {
  src: string;
  altText: string;
}): ImageNode {
  return new ImageNode(
    src,
    altText,
    width,
    height,
    maxWidth,
    showCaption,
    caption,
    key
  );
}

export function $isImageNode(node: any): node is ImageNode {
  return node instanceof ImageNode;
}
