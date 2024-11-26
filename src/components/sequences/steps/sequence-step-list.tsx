"use client";

import { useState } from "react";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import { Mail, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { SequenceStep } from "@/types/sequences";

interface Props {
  steps: SequenceStep[];
  onReorder: (steps: SequenceStep[]) => Promise<void>;
  onEdit: (step: SequenceStep) => void;
  onDuplicate: (step: SequenceStep) => Promise<void>;
  onDelete: (step: SequenceStep) => Promise<void>;
}

export function SequenceStepList({
  steps,
  onReorder,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const [orderedSteps, setOrderedSteps] = useState(steps);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);

    if (!result.destination) return;

    const items = Array.from(orderedSteps);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order property
    const updatedItems = items.map((item, index) => ({
      ...item,
      order: index,
    }));

    setOrderedSteps(updatedItems);

    try {
      await onReorder(updatedItems);
    } catch (error) {
      toast.error("Failed to reorder steps");
      setOrderedSteps(steps); // Revert on error
    }
  };

  return (
    <DragDropContext
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
    >
      <Droppable droppableId="steps">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="border rounded-lg divide-y"
          >
            {orderedSteps.map((step, index) => (
              <Draggable key={step.id} draggableId={step.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={cn(
                      "p-4 flex items-center gap-4",
                      snapshot.isDragging && "bg-muted"
                    )}
                  >
                    <div
                      {...provided.dragHandleProps}
                      className="flex-shrink-0 cursor-grab"
                    >
                      <DragHandleDots2Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Day {index + 1}: Manual email
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {step.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {step.subject || "(No Subject)"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{step.priority}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(step)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDuplicate(step)}>
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(step)}
                            className="text-destructive"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
