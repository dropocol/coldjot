"use client";

import { Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coldjot/ui";

interface CopyButtonProps {
  textToCopy: string;
}

export default function CopyButton({ textToCopy }: CopyButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              navigator.clipboard.writeText(textToCopy);
              const tooltip = document.getElementById("copy-tooltip");
              if (tooltip) {
                tooltip.innerText = "Copied!";
                setTimeout(() => {
                  tooltip.innerText = "Copy email";
                }, 2000);
              }
            }}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent id="copy-tooltip">Copy email</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
