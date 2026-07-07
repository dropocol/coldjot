"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { LocalSearch } from "@coldjot/ui/components/local-search";
import { Button } from "@coldjot/ui/components/button";
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
import TemplateList from "@/components/templates/template-list";
import { Separator } from "@coldjot/ui/components/separator";
import AddTemplateDrawer from "@/components/templates/add-template-drawer";
import { Template } from "@prisma/client";
import { usePagination } from "@/hooks/use-pagination";
import {
  isTemplateInUseError,
  useBulkDeleteTemplates,
} from "@/hooks/queries/use-templates";

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const bulkDelete = useBulkDeleteTemplates();
  const pagination = usePagination({ enableInfiniteScroll: false });

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleAddTemplate = (newTemplate: Template) => {
    setTemplates((prev) => [newTemplate, ...prev]);
  };

  const handleSelectedTemplatesChange = (templateIds: string[]) => {
    setSelectedTemplates(templateIds);
  };

  const handleBulkDelete = async () => {
    try {
      const res = await bulkDelete.mutateAsync({
        templateIds: selectedTemplates,
      });
      if (res.blocked > 0) {
        // Partial success: some moved to trash, some blocked by active use.
        // Keep the blocked ids selected so the user can act on them.
        const blockedIds = new Set(res.blockedTemplates.map((b) => b.id));
        setSelectedTemplates((prev) => prev.filter((id) => blockedIds.has(id)));
        setDeleteDialogOpen(false);
        const names = res.blockedTemplates.map((b) => b.name).join(", ");
        toast.warning(
          `Moved ${res.deleted} to trash. Blocked ${res.blocked} in active use: ${names}.`
        );
      } else {
        // Full success: everything moved to trash.
        setSelectedTemplates([]);
        setDeleteDialogOpen(false);
        toast.success(
          `Moved ${res.deleted} template${res.deleted === 1 ? "" : "s"} to trash.`
        );
      }
    } catch (error) {
      // 409 = every id was blocked by active use. Surface the names and keep
      // the full selection so the user can investigate.
      if (isTemplateInUseError(error)) {
        const names = error.blockedTemplates.map((b) => b.name).join(", ");
        toast.error(`Cannot delete — all in active use: ${names}.`);
        setDeleteDialogOpen(false);
      } else {
        toast.error("Failed to delete templates");
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Templates"
            description="Manage your email templates."
          />
          <div className="flex items-center gap-3">
            {selectedTemplates.length > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedTemplates.length}
              </Button>
            ) : (
              <>
                <LocalSearch
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onSearch={handleSearch}
                  isLoading={isSearching}
                />
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Template
                </Button>
              </>
            )}
          </div>
        </div>
        <Separator />
      </div>

      <TemplateList
        searchQuery={activeSearch}
        initialTemplates={templates}
        onSearchEnd={() => setIsSearching(false)}
        onAddTemplate={() => setShowAddModal(true)}
        onSelectedTemplatesChange={handleSelectedTemplatesChange}
        page={pagination.page}
        limit={pagination.limit}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
      />

      {showAddModal && (
        <AddTemplateDrawer
          onClose={() => setShowAddModal(false)}
          onSave={(newTemplate) => {
            handleAddTemplate(newTemplate);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Bulk delete confirm dialog (soft-delete: hides from list, keeps send-path content) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {selectedTemplates.length} template
              {selectedTemplates.length === 1 ? "" : "s"} to Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sequences already using them will keep working until you detach
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? "Moving..." : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
