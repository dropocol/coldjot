"use client";

import { useState } from "react";
import { Plus, Workflow, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { LocalSearch } from "@coldjot/ui/components/local-search";
import { Button } from "@coldjot/ui/components/button";
import { Separator } from "@coldjot/ui/components/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { SequenceTable } from "@/components/sequences/sequence-table";
import { SequenceStatus, SequenceStep } from "@coldjot/types";
import { usePagination } from "@/hooks/use-pagination";
import { useSequences, useBulkDeleteSequences } from "@/hooks/queries/use-sequences";

interface Sequence {
  id: string;
  name: string;
  status: SequenceStatus;
  accessLevel: string;
  scheduleType: string;
  steps: SequenceStep[];
  _count: {
    contacts: number;
  };
}

interface SequencesPageClientProps {
  initialSequences: Sequence[];
}

export function SequencesPageClient({
  initialSequences,
}: SequencesPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSequences, setSelectedSequences] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const pagination = usePagination({ enableInfiniteScroll: false });

  const { data, isLoading, isFetching } = useSequences({
    page: pagination.page,
    limit: pagination.limit,
    search: activeSearch || undefined,
  });
  const sequences = (data?.sequences ?? initialSequences) as Sequence[];
  const total = data?.total ?? initialSequences.length;
  const bulkDelete = useBulkDeleteSequences();

  const handleSearch = (value: string) => {
    setActiveSearch(value);
  };

  const handleSelectedSequencesChange = (sequenceIds: string[]) => {
    setSelectedSequences(sequenceIds);
  };

  const handleBulkDelete = async () => {
    try {
      const res = await bulkDelete.mutateAsync(selectedSequences);
      const deleted = res?.deleted ?? selectedSequences.length;
      setSelectedSequences([]);
      setDeleteDialogOpen(false);
      toast.success(
        `Deleted ${deleted} sequence${deleted === 1 ? "" : "s"}.`
      );
    } catch {
      toast.error("Failed to delete sequences");
    }
  };

  // SequenceTable mutates local state for optimistic updates between
  // invalidation and refetch; we no longer keep a separate `sequences` state,
  // so onAddSequence is a no-op here (the table invalidates qk.sequences.all).
  const handleAddSequence = (_newSequence: Sequence) => {
    void _newSequence;
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            icon={Workflow}
            title="Sequences"
            description="Create and manage your email sequences"
          />
          <div className="flex items-center gap-3">
            {selectedSequences.length > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedSequences.length}
              </Button>
            ) : (
              <>
                <LocalSearch
                  placeholder="Search sequences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onSearch={handleSearch}
                  isLoading={isFetching}
                />
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Sequence
                </Button>
              </>
            )}
          </div>
        </div>
        <Separator />
      </div>
      <SequenceTable
        sequences={sequences}
        showCreateModal={showCreateModal}
        onOpenCreateModal={() => setShowCreateModal(true)}
        onCloseCreateModal={() => setShowCreateModal(false)}
        onAddSequence={handleAddSequence}
        isLoading={isLoading}
        page={pagination.page}
        limit={pagination.limit}
        total={total}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
        onSelectedSequencesChange={handleSelectedSequencesChange}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedSequences.length} sequence
              {selectedSequences.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
