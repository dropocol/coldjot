"use client";

import { useState } from "react";
import { Trash2, RotateCcw, Loader2, User2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { LocalSearch } from "@coldjot/ui/components/local-search";
import { Button } from "@coldjot/ui/components/button";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coldjot/ui/components/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { PaginationControls } from "@/components/pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  useTrashedContacts,
  useRestoreContacts,
  useBulkDeleteContacts,
} from "@/hooks/queries/use-contacts";
import { format } from "date-fns";
import type { Contact } from "@coldjot/types";

export default function ContactsTrashPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [purgeTarget, setPurgeTarget] = useState<string[] | null>(null);

  const pagination = usePagination({ enableInfiniteScroll: false });
  const restore = useRestoreContacts();
  const purge = useBulkDeleteContacts();

  const { data, isLoading } = useTrashedContacts({
    page: pagination.page,
    limit: pagination.limit,
    search: activeSearch,
  });

  const contacts: Contact[] = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selected.includes(c.id));

  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((prev) => prev.filter((id) => !contacts.some((c) => c.id === id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...contacts.map((c) => c.id)])));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSearch = (value: string) => {
    setActiveSearch(value);
  };

  // Restore — supports single id or the whole selection.
  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await restore.mutateAsync(ids);
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(`Restored ${res.restored} contact${res.restored === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to restore contact(s)");
    }
  };

  // Hard-delete (purge) — irreversible. Confirmed via the AlertDialog.
  const confirmPurge = async () => {
    if (!purgeTarget || purgeTarget.length === 0) return;
    try {
      const res = await purge.mutateAsync({
        contactIds: purgeTarget,
        mode: "hard",
      });
      setSelected((prev) => prev.filter((id) => !purgeTarget.includes(id)));
      toast.success(`Permanently deleted ${res.deleted} contact${res.deleted === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to delete contact(s)");
    } finally {
      setPurgeTarget(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Contacts
      </Link>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Trash" description="Restore contacts or permanently delete them." />
          <div className="flex items-center gap-3">
            {selected.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleRestore(selected)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore {selected.length}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setPurgeTarget(selected)}
                  disabled={purge.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selected.length} permanently
                </Button>
              </>
            ) : (
              <LocalSearch
                placeholder="Search trash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onSearch={handleSearch}
              />
            )}
          </div>
        </div>
      </div>

      {total === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center border rounded-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Trash2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Trash is empty</h3>
          <p className="text-sm text-muted-foreground">
            Deleted contacts will appear here for recovery.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all on page"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.email}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User2 className="h-4 w-4 text-muted-foreground" />
                        {c.name || `${c.firstName} ${c.lastName}`.trim() || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.deletedAt ? format(new Date(c.deletedAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore([c.id])}
                          disabled={restore.isPending}
                        >
                          <RotateCcw className="h-4 w-4 mr-1.5" />
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPurgeTarget([c.id])}
                          disabled={purge.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <PaginationControls
          currentPage={pagination.page}
          totalPages={totalPages}
          pageSize={pagination.limit}
          totalItems={total}
          isLoading={isLoading}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}

      {/* Permanent-delete confirmation (irreversible) */}
      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {purgeTarget?.length ?? 0} contact
              {purgeTarget?.length === 1 ? "" : "s"} permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the contacts <strong>and all their data</strong> — analytics, events,
              tracking, threads, and sequence enrollments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purge.isPending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmPurge} disabled={purge.isPending}>
              {purge.isPending ? "Deleting..." : "Delete permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
