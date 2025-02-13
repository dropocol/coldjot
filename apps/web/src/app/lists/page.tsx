"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@/components/ui/local-search";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import EmailListsView from "../../components/lists/email-list";
import { usePagination } from "@/hooks/use-pagination";

export default function ListsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const pagination = usePagination({ enableInfiniteScroll: false });

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleToggleModal = () => {
    setShowAddModal((prev) => !prev);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Email Lists"
            description="Create and manage your email lists for targeted campaigns"
          />
          <div className="flex items-center gap-3">
            <LocalSearch
              placeholder="Search lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={handleSearch}
              isLoading={isSearching}
            />
            <Button onClick={handleToggleModal}>
              <Plus className="h-4 w-4 mr-2" />
              Create List
            </Button>
          </div>
        </div>
        <Separator />
      </div>
      <EmailListsView
        searchQuery={activeSearch}
        onSearchEnd={() => setIsSearching(false)}
        showAddModal={showAddModal}
        onAddModalClose={handleToggleModal}
        page={pagination.page}
        limit={pagination.limit}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
      />
    </div>
  );
}
