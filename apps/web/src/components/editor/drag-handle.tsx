"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DragHandleProps {
  onAddClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  style?: React.CSSProperties;
}

export function DragHandle({
  onAddClick,
  onDragStart,
  style,
}: DragHandleProps) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-1 opacity-0 transition-opacity",
        "group-hover/block:opacity-100 hover:opacity-100 focus-within:opacity-100"
      )}
      style={style}
      draggable="false"
    >
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 transition-colors"
        onClick={onAddClick}
      >
        <Plus className="h-4 w-4 text-gray-600" />
      </button>
      <button
        type="button"
        className="flex h-6 w-6 cursor-grab items-center justify-center rounded hover:bg-gray-100 transition-colors"
        onDragStart={onDragStart}
        draggable
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-gray-600"
        >
          <path
            d="M4 4.5A1.5 1.5 0 1 1 4 1.5a1.5 1.5 0 0 1 0 3zm0 5A1.5 1.5 0 1 1 4 6.5a1.5 1.5 0 0 1 0 3zm0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm8-10A1.5 1.5 0 1 1 12 1.5a1.5 1.5 0 0 1 0 3zm0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
}
