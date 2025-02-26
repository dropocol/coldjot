import { Button } from "@/components/ui/button";
import {
  LexicalEditor,
  UNDO_COMMAND,
  REDO_COMMAND,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import {
  Image as ImageIcon,
  Variable,
  SplitSquareVertical,
  Minus,
  Smile,
  Columns,
  RotateCcw,
  RotateCw,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { $createHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";

import {
  INSERT_IMAGE_COMMAND,
  INSERT_INLINE_IMAGE_COMMAND,
  InsertImageUriDialog,
} from "../plugins/images-plugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "../plugins/horizontal-line-plugin";

interface EditorToolbarProps {
  editorInstance: LexicalEditor | null;
}

export function EditorToolbar({ editorInstance }: EditorToolbarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInlineImage, setIsInlineImage] = useState(false);

  const handleInsertImage = (payload: any) => {
    if (editorInstance) {
      editorInstance.dispatchCommand(
        isInlineImage ? INSERT_INLINE_IMAGE_COMMAND : INSERT_IMAGE_COMMAND,
        payload
      );
    }
  };

  const formatHeading = (headingTag: "h1" | "h2" | "h3" | "p") => {
    if (!editorInstance) return;

    editorInstance.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      if (headingTag === "p") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(headingTag));
      }
    });
  };

  return (
    <div className="sticky top-[57px] z-30 bg-white border rounded-t-md shadow-sm mb-0">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        {/* Heading Buttons */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => formatHeading("h1")}
                aria-label="Heading 1"
              >
                <Heading1 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Heading 1</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => formatHeading("h2")}
                aria-label="Heading 2"
              >
                <Heading2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Heading 2</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => formatHeading("h3")}
                aria-label="Heading 3"
              >
                <Heading3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Heading 3</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-6 w-px bg-gray-200" />

        {/* Component Buttons */}
        <TooltipProvider>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Tooltip>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0"
                    aria-label="Insert image"
                    onClick={() => setIsInlineImage(false)}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <TooltipContent>
                <p>Insert Block Image</p>
              </TooltipContent>
            </Tooltip>
            <InsertImageUriDialog
              onClose={() => setIsDialogOpen(false)}
              onInsert={handleInsertImage}
              isInline={isInlineImage}
            />
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Tooltip>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0"
                    aria-label="Insert inline image"
                    onClick={() => {
                      setIsInlineImage(true);
                      setIsDialogOpen(true);
                    }}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <TooltipContent>
                <p>Insert Inline Image</p>
              </TooltipContent>
            </Tooltip>
          </Dialog>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  console.log("Data Variable clicked");
                }}
                aria-label="Insert data variable"
              >
                <Variable className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Data Variable</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  console.log("Button clicked");
                }}
                aria-label="Insert button"
              >
                <SplitSquareVertical className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Button</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  if (editorInstance) {
                    editorInstance.dispatchCommand(
                      INSERT_HORIZONTAL_RULE_COMMAND,
                      undefined
                    );
                  }
                }}
                aria-label="Insert divider"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Horizontal Divider</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  console.log("Icon clicked");
                }}
                aria-label="Insert icon"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Icons</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  console.log("Columns clicked");
                }}
                aria-label="Insert columns"
              >
                <Columns className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insert Columns</p>
            </TooltipContent>
          </Tooltip>

          <div className="h-6 w-px bg-gray-200" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  if (editorInstance) {
                    editorInstance.dispatchCommand(UNDO_COMMAND, undefined);
                  }
                }}
                aria-label="Undo"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo Action</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => {
                  if (editorInstance) {
                    editorInstance.dispatchCommand(REDO_COMMAND, undefined);
                  }
                }}
                aria-label="Redo"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo Action</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
