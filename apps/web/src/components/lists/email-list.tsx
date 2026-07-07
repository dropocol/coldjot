"use client";

import { useState, useEffect } from "react";
import { AlertCircle, MoreHorizontal, Users } from "lucide-react";
import { Button } from "@coldjot/ui/components/button";
import { EmailList } from "@coldjot/types";
import { CreateListModal } from "./create-list-modal";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@coldjot/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coldjot/ui/components/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";
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
import { Checkbox } from "@coldjot/ui/components/checkbox";
import { useRouter } from "next/navigation";
import { PaginationControls } from "@/components/pagination";
import { useLists, useCreateList, useDeleteList } from "@/hooks/queries/use-lists";

interface EmailListsViewProps {
  searchQuery?: string;
  onSearchEnd?: () => void;
  showAddModal: boolean;
  onAddModalClose: () => void;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectedListsChange?: (ids: string[]) => void;
}

type EmailListWithCount = EmailList & {
  _count: {
    contacts: number;
  };
};

const EmailListsView = ({
  searchQuery = "",
  onSearchEnd,
  showAddModal,
  onAddModalClose,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
  onSelectedListsChange,
}: EmailListsViewProps) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState<EmailList | null>(null);
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch } = useLists({
    page,
    limit,
    search: searchQuery || undefined,
  });
  const createList = useCreateList();
  const deleteList = useDeleteList();

  // Surface the parent's search-end callback when fetching settles.
  useEffect(() => {
    if (!isFetching) onSearchEnd?.();
    // Parent callback is treated as stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  // Notify parent component when selected lists change
  useEffect(() => {
    if (onSelectedListsChange) {
      const listIds = Array.from(selectedLists);
      onSelectedListsChange(listIds);
    }
    // Intentionally only re-runs when the selection changes; the parent callback
    // is treated as stable to avoid notification loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLists]);

  const lists = (data?.lists ?? []) as EmailListWithCount[];
  const total = data?.total ?? 0;

  const handleCreateList = async (list: Omit<EmailList, "id" | "createdAt" | "updatedAt">) => {
    try {
      setError(null);
      await createList.mutateAsync({
        name: list.name,
        description: list.description,
        tags: list.tags,
      });
      toast.success("Email list created successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create email list";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDeleteList = async (list: EmailList) => {
    try {
      setError(null);
      await deleteList.mutateAsync(list.id);
      toast.success("Email list deleted successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete email list";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleRetry = () => {
    setError(null);
    void refetch();
    // Reset to the first page as the previous behavior did.
    onPageChange(1);
  };

  const handleCheckboxChange = (listId: string, checked: boolean) => {
    setSelectedLists((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(listId);
      } else {
        next.delete(listId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="rounded-md border">
          <div className="p-4">Loading...</div>
        </div>
      ) : lists.length === 0 && !error ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No email lists found.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              onAddModalClose?.();
            }}
          >
            Create your first list
          </Button>
        </div>
      ) : (
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] pl-3">
                  <Checkbox
                    checked={selectedLists.size === lists.length && lists.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedLists(new Set(lists.map((l) => l.id)));
                      } else {
                        setSelectedLists(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contacts</TableHead>
                {/* <TableHead>Tags</TableHead> */}
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow
                  key={list.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest(".checkbox-cell")) {
                      router.push(`/lists/${list.id}`);
                    }
                  }}
                >
                  <TableCell className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedLists.has(list.id)}
                      onCheckedChange={(checked) =>
                        handleCheckboxChange(list.id, checked as boolean)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{list.name}</div>
                    {list.description && (
                      <div className="text-sm text-muted-foreground">{list.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{list._count?.contacts ?? 0} contacts</span>
                    </div>
                  </TableCell>
                  {/* <TableCell>
                    {list.tags && list.tags.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span>{list.tags.length} tags</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell> */}
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          onClick={(e) => e.stopPropagation()}
                          render={<Button variant="ghost" size="icon" />}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/lists/${list.id}`);
                            }}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingList(list);
                            }}
                            className="text-destructive"
                          >
                            Delete List
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        currentPage={page}
        totalPages={Math.ceil(total / limit)}
        pageSize={limit}
        totalItems={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <CreateListModal
        open={showAddModal}
        onClose={() => onAddModalClose?.()}
        onCreate={async (list) => {
          await handleCreateList(list);
          onAddModalClose?.();
        }}
      />

      <AlertDialog
        open={!!deletingList}
        onOpenChange={(open) => {
          if (!open) setDeletingList(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the list and removes all contacts from
              it. The contacts themselves are not deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingList) {
                  handleDeleteList(deletingList);
                  setDeletingList(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmailListsView;
