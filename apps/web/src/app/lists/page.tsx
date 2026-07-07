"use client";

import { useState } from "react";
import { Plus, Mails, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { LocalSearch } from "@coldjot/ui/components/local-search";
import { Button } from "@coldjot/ui/components/button";
import { Separator } from "@coldjot/ui/components/separator";
import EmailListsView from "@/components/lists/email-list";
import { usePagination } from "@/hooks/use-pagination";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { useBulkDeleteLists } from "@/hooks/queries/use-lists";

export default function ListsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const bulkDelete = useBulkDeleteLists();
  const pagination = usePagination({ enableInfiniteScroll: false });

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleToggleModal = () => {
    setShowAddModal((prev) => !prev);
  };

  const handleSelectedListsChange = (ids: string[]) => {
    setSelectedLists(ids);
  };

  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    const count = selectedLists.length;
    try {
      const res = await bulkDelete.mutateAsync(selectedLists);
      setSelectedLists([]);
      setDeleteDialogOpen(false);
      toast.success(
        `Deleted ${res.deleted ?? count} list${(res.deleted ?? count) === 1 ? "" : "s"}.`
      );
    } catch {
      toast.error("Failed to delete lists");
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            icon={Mails}
            title="Email Lists"
            description="Create and manage your email lists for targeted campaigns"
          />
          <div className="flex items-center gap-3">
            {selectedLists.length > 0 ? (
              <Button
                variant="destructive"
                onClick={openDeleteDialog}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedLists.length}
              </Button>
            ) : (
              <>
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
              </>
            )}
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
        onSelectedListsChange={handleSelectedListsChange}
      />

      {/* Bulk delete confirm dialog (lists are hard-delete only) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedLists.length} list
              {selectedLists.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Contacts in them are not deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
