"use client";

import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { Mail, MoreHorizontal } from "lucide-react";
import { Badge } from "@coldjot/ui/components/badge";
import { Button } from "@coldjot/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@coldjot/ui/lib/utils";
import type { SequenceStep } from "@coldjot/types";

interface Props {
  steps: SequenceStep[];
  onReorder: (steps: SequenceStep[]) => Promise<void>;
  onEdit: (step: SequenceStep) => void;
  onEditTemplate: (step: SequenceStep) => void;
  onDuplicate: (step: SequenceStep) => Promise<void>;
  onDelete: (step: SequenceStep) => Promise<void>;
}

interface StepActionsProps {
  step: SequenceStep;
  onEdit: (step: SequenceStep) => void;
  onEditTemplate: (step: SequenceStep) => void;
  onDuplicate: (step: SequenceStep) => Promise<void>;
  onDelete: (step: SequenceStep) => Promise<void>;
}

export function SequenceStepList({
  steps,
  onReorder,
  onEdit,
  onEditTemplate,
  onDuplicate,
  onDelete,
}: Props) {
  const [orderedSteps, setOrderedSteps] = useState(steps);
  const [_isDragging, setIsDragging] = useState(false);

  // Keep local order in sync with the query-backed prop. The prop starts empty
  // on a hard reload (the query has no initialData yet) and fills in once the
  // background fetch resolves; without this, the snapshot from useState would
  // stay stuck at [] and the list would never render until a remount.
  useEffect(() => {
    setOrderedSteps(steps);
  }, [steps]);

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
    } catch (_error) {
      toast.error("Failed to reorder steps");
      setOrderedSteps(steps); // Revert on error
    }
  };

  return (
    <DragDropContext onDragStart={() => setIsDragging(true)} onDragEnd={handleDragEnd}>
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
                    className={cn("p-4 flex items-center gap-4", snapshot.isDragging && "bg-muted")}
                  >
                    <div {...provided.dragHandleProps} className="flex-shrink-0 cursor-grab">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Day {index + 1}: Manual email</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {step.subject || "(No Subject)"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{step.priority}</Badge>
                      <StepActions
                        step={step}
                        onEdit={onEdit}
                        onEditTemplate={onEditTemplate}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete}
                      />
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

function StepActions({ step, onEdit, onEditTemplate, onDuplicate, onDelete }: StepActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(step)}>Edit Settings</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEditTemplate(step)}>Edit Template</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(step)}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(step)} className="text-destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
