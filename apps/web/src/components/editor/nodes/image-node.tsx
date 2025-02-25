"use client";

import { DecoratorNode, SerializedLexicalNode, Spread } from "lexical";
import * as React from "react";
import { ImageComponent } from "../components/image-component";

export interface ImagePayload
  extends Spread<
    {
      src: string;
      altText: string;
      caption?: string;
      width?: number;
      height?: number;
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
  __caption?: string;
  __width?: number;
  __height?: number;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__caption,
      node.__width,
      node.__height,
      node.__key
    );
  }

  static importJSON(serializedNode: ImagePayload): ImageNode {
    const { src, altText, caption, width, height } = serializedNode;
    const node = $createImageNode({
      src,
      altText,
      caption,
      width,
      height,
      type: "image",
      version: 1,
    });
    return node;
  }

  exportJSON(): ImagePayload {
    return {
      src: this.__src,
      altText: this.__altText,
      caption: this.__caption,
      width: this.__width,
      height: this.__height,
      type: "image",
      version: 1,
    };
  }

  constructor(
    src: string,
    altText: string,
    caption?: string,
    width?: number,
    height?: number,
    key?: string
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__caption = caption;
    this.__width = width;
    this.__height = height;
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
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        caption={this.__caption}
        nodeKey={this.__key}
      />
    );
  }

  isIsolated(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createImageNode({
  src,
  altText,
  caption,
  width,
  height,
  key,
  type = "image",
  version = 1,
}: Partial<ImagePayload> & {
  src: string;
  altText: string;
  key?: string;
}): ImageNode {
  return new ImageNode(src, altText, caption, width, height, key);
}

export function $isImageNode(node: any): node is ImageNode {
  return node instanceof ImageNode;
}
