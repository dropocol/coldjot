"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Play,
  Pause,
  Settings2,
  ExternalLink,
  MoreHorizontal,
  Copy,
  Loader2,
} from "lucide-react";
import { CreateSequenceModal } from "./create-sequence-modal";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceStatus } from "@coldjot/types";
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

interface Sequence {
  id: string;
  name: string;
  status: SequenceStatus;
  accessLevel: string;
  scheduleType: string;
  steps: any[];
  _count: {
    contacts: number;
  };
}

interface SequenceTableProps {
  initialSequences: Sequence[];
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onAddSequence?: () => void;
}

export function SequenceTable({
  initialSequences,
  showCreateModal,
  onCloseCreateModal,
  onAddSequence,
}: SequenceTableProps) {
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const router = useRouter();

  const handleCreateSuccess = async () => {
    try {
      const response = await fetch("/api/sequences");
      if (!response.ok) throw new Error("Failed to fetch sequences");
      const data = await response.json();
      setSequences(data);
      onCloseCreateModal();
      toast.success("Sequence created successfully");
      router.refresh();
    } catch (error) {
      toast.error("Failed to refresh sequences");
    }
  };

  const handleDuplicate = async (sequenceId: string) => {
    try {
      setDuplicatingId(sequenceId);
      const response = await fetch(`/api/sequences/${sequenceId}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to duplicate sequence");

      const duplicatedSequence = await response.json();
      setSequences((prev) => [...prev, duplicatedSequence]);
      toast.success("Sequence duplicated successfully");
      router.refresh();
    } catch (error) {
      toast.error("Failed to duplicate sequence");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleStatusChange = async (
    sequenceId: string,
    currentStatus: SequenceStatus
  ) => {
    const newStatus: SequenceStatus =
      currentStatus === SequenceStatus.ACTIVE
        ? SequenceStatus.PAUSED
        : SequenceStatus.ACTIVE;
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error("Failed to update sequence status");

      setSequences((prev) =>
        prev.map((seq) =>
          seq.id === sequenceId ? { ...seq, status: newStatus } : seq
        )
      );
    } catch (error) {
      toast.error("Failed to update sequence status");
    }
  };

  if (sequences.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex justify-center mb-4">
          <Mail className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Create your first sequence</h3>
        <p className="text-muted-foreground mb-4">
          Build custom campaigns to automate emails, set more meetings, and
          convert more customers.
        </p>
        <Button onClick={onAddSequence}>Create a sequence</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sequences.map((sequence) => (
              <TableRow key={sequence.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground/70" />
                    <Link
                      href={`/sequences/${sequence.id}`}
                      className="font-medium hover:underline"
                    >
                      {sequence.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  <SequenceStatusBadge status={sequence.status} />
                </TableCell>
                <TableCell>
                  <span className="capitalize">{sequence.scheduleType}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{sequence.steps.length} steps</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{sequence._count.contacts} contacts</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleStatusChange(sequence.id, sequence.status)
                            }
                          >
                            {sequence.status === SequenceStatus.ACTIVE ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {sequence.status === SequenceStatus.ACTIVE
                            ? "Pause"
                            : "Resume"}{" "}
                          sequence
                        </TooltipContent>
                      </Tooltip>

                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>More actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/sequences/${sequence.id}/settings`}
                              className="flex items-center"
                            >
                              <Settings2 className="mr-2 h-4 w-4" />
                              Settings
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/sequences/${sequence.id}`}
                              className="flex items-center"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(sequence.id)}
                            disabled={duplicatingId === sequence.id}
                          >
                            {duplicatingId === sequence.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Duplicating...
                              </>
                            ) : (
                              <>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateSequenceModal
        open={showCreateModal}
        onClose={onCloseCreateModal}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
