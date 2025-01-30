"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@/components/ui/local-search";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SequenceTable } from "@/components/sequences/sequence-table";
import { SequenceStatus } from "@coldjot/types";

interface Sequence {
  id: string;
  name: string;
  status: SequenceStatus;
  accessLevel: string;
  scheduleType: string;
  steps: any[];
  contacts: any[];
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
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
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
              isLoading={isSearching}
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
        initialSequences={initialSequences}
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        onAddSequence={() => setShowCreateModal(true)}
      />
    </div>
  );
}
