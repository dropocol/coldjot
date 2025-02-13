"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@/components/ui/local-search";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SequenceTable } from "@/components/sequences/sequence-table";
import { SequenceStatus } from "@coldjot/types";
import { usePagination } from "@/hooks/use-pagination";

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

interface SequenceResponse {
  sequences: Sequence[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
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
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const pagination = usePagination({ enableInfiniteScroll: false });

  useEffect(() => {
    const fetchSequences = async () => {
      setIsLoading(true);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("page", pagination.page.toString());
        queryParams.set("limit", pagination.limit.toString());
        if (activeSearch) {
          queryParams.set("q", activeSearch);
        }

        const response = await fetch(
          `/api/sequences?${queryParams.toString()}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch sequences");
        }

        const data: SequenceResponse = await response.json();
        setSequences(data.sequences);
        setTotal(data.total);
      } catch (error) {
        console.error("Failed to fetch sequences:", error);
      } finally {
        setIsLoading(false);
        setIsSearching(false);
      }
    };

    fetchSequences();
  }, [activeSearch, pagination.page, pagination.limit]);

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleAddSequence = (newSequence: Sequence) => {
    setSequences((prev) => [newSequence, ...prev]);
    setTotal((prev) => prev + 1);
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
        sequences={sequences}
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        // onAddSequence={handleAddSequence}
        onAddSequence={() => setShowCreateModal(true)}
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
