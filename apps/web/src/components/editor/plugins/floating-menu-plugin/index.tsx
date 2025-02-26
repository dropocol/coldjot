"use client";

import { JSX } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  $getSelection,
  $isRangeSelection,
  RangeSelection,
  $createParagraphNode,
} from "lexical";
import { $isHeadingNode, $createHeadingNode } from "@lexical/rich-text";
import { $findMatchingParent } from "@lexical/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Type,
  ChevronDown,
} from "lucide-react";
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $isListNode, ListNode } from "@lexical/list";
import { LinkDialog } from "../../components/link-dialog";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $isLinkNode, LinkNode } from "@lexical/link";

export function FloatingMenuPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [isText, setIsText] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isHeading, setIsHeading] = useState<{
    h1: boolean;
    h2: boolean;
    h3: boolean;
  }>({
    h1: false,
    h2: false,
    h3: false,
  });
  const [isList, setIsList] = useState<{
    ul: boolean;
    ol: boolean;
  }>({
    ul: false,
    ol: false,
  });
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const updateFloatingMenu = useCallback(() => {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const rangeSelection = selection as RangeSelection;
      const textContent = rangeSelection.getTextContent();
      const domSelection = window.getSelection();

      if (!domSelection || rangeSelection.isCollapsed() || !textContent) {
        setIsVisible(false);
        return;
      }

      setIsBold(rangeSelection.hasFormat("bold"));
      setIsItalic(rangeSelection.hasFormat("italic"));
      setIsUnderline(rangeSelection.hasFormat("underline"));
      setIsText(true);

      // Check for links
      const anchorNode = rangeSelection.anchor.getNode();
      const focusNode = rangeSelection.focus.getNode();
      const linkNode =
        $findMatchingParent(anchorNode, $isLinkNode) ||
        $findMatchingParent(focusNode, $isLinkNode);

      if (linkNode) {
        setIsLink(true);
        setLinkUrl((linkNode as LinkNode).getURL());
      } else {
        setIsLink(false);
        setLinkUrl("");
      }

      // Check for headings
      const headingNode = $findMatchingParent(anchorNode, $isHeadingNode);

      setIsHeading({
        h1: headingNode?.getTag() === "h1",
        h2: headingNode?.getTag() === "h2",
        h3: headingNode?.getTag() === "h3",
      });

      // Check for lists
      const listNode = $findMatchingParent(anchorNode, $isListNode);
      setIsList({
        ul: listNode?.getTag() === "ul",
        ol: listNode?.getTag() === "ol",
      });

      // Position the floating menu
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();

      if (rect) {
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10, // Position above the selection
        });
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    } else {
      setIsVisible(false);
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateFloatingMenu();
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, updateFloatingMenu]);

  useEffect(() => {
    // Close the menu when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const formatHeading = (headingTag: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const anchorNode = selection.anchor.getNode();
      const targetNode = anchorNode.getTopLevelElement() || anchorNode;

      if (headingTag === "p") {
        // Convert to paragraph
        const paragraph = $createParagraphNode();
        targetNode.replace(paragraph);
        paragraph.select();
      } else {
        // Convert to heading
        const heading = $createHeadingNode(headingTag as "h1" | "h2" | "h3");
        targetNode.replace(heading);
        heading.select();
      }
    });
  };

  const toggleBulletList = () => {
    if (isList.ul) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    }
  };

  const toggleOrderedList = () => {
    if (isList.ol) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
  };

  const handleLinkSubmit = (url: string) => {
    if (url === "") {
      // If URL is empty, remove the link
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    }
  };

  const handleLinkClick = () => {
    if (isLink) {
      // If it's already a link, open the dialog with the current URL
      setShowLinkDialog(true);
    } else {
      // If it's not a link, open the dialog with empty URL
      setLinkUrl("");
      setShowLinkDialog(true);
    }
  };

  if (!isVisible) {
    return null;
  }

  const getHeadingText = () => {
    if (isHeading.h1) return "Heading 1";
    if (isHeading.h2) return "Heading 2";
    if (isHeading.h3) return "Heading 3";
    return "Normal Text";
  };

  return (
    <>
      {createPortal(
        <div
          ref={menuRef}
          className="absolute z-50 flex items-center gap-1 p-1 bg-white border rounded-md shadow-md"
          style={{
            top: `${position.y - 40}px`,
            left: `${position.x - 150}px`,
            transform: "translateX(-50%)",
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Type className="h-4 w-4" />
                <span className="text-xs">{getHeadingText()}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => formatHeading("p")}>
                Normal Text
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => formatHeading("h1")}>
                Heading 1
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => formatHeading("h2")}>
                Heading 2
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => formatHeading("h3")}>
                Heading 3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
                  }
                  className={isBold ? "bg-muted" : ""}
                  aria-label="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Bold</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
                  }
                  className={isItalic ? "bg-muted" : ""}
                  aria-label="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Italic</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
                  }
                  className={isUnderline ? "bg-muted" : ""}
                  aria-label="Underline"
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Underline</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")
                  }
                  aria-label="Align left"
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Align Left</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")
                  }
                  aria-label="Align center"
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Align Center</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")
                  }
                  aria-label="Align right"
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Align Right</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleBulletList}
                  className={isList.ul ? "bg-muted" : ""}
                  aria-label="Bullet list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Bullet List</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleOrderedList}
                  className={isList.ol ? "bg-muted" : ""}
                  aria-label="Numbered list"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Numbered List</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLinkClick}
                  className={isLink ? "bg-muted" : ""}
                  aria-label="Insert link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isLink ? "Edit Link" : "Insert Link"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>,
        document.body
      )}
      <LinkDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        onSubmit={handleLinkSubmit}
        initialUrl={linkUrl}
      />
    </>
  );
}
