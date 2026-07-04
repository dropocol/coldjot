"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@coldjot/ui";
import { Button } from "@coldjot/ui";
import { Separator } from "@coldjot/ui";
import { SequenceTable } from "@/components/sequences/sequence-table";
import { SequenceStatus, SequenceStep } from "@coldjot/types";
import { usePagination } from "@/hooks/use-pagination";
import { useSequences } from "@/hooks/queries/use-sequences";

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
  const pagination = usePagination({ enableInfiniteScroll: false });

  const { data, isLoading, isFetching } = useSequences({
    page: pagination.page,
    limit: pagination.limit,
    search: activeSearch || undefined,
  });
  const sequences = (data?.sequences ?? initialSequences) as Sequence[];
  const total = data?.total ?? initialSequences.length;

  const handleSearch = (value: string) => {
    setActiveSearch(value);
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
            title="Sequences"
            description="Create and manage your email sequences"
          />
          <div className="flex items-center gap-3">
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
          </div>
        </div>
        <Separator />
      </div>
      <SequenceTable
        sequences={sequences}
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        onAddSequence={handleAddSequence}
        isLoading={isLoading}
        page={pagination.page}
        limit={pagination.limit}
        total={total}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
      />
    </div>
  );
}
