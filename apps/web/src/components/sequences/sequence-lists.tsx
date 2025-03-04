"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "react-hot-toast";
import { Loader2, Plus, X, ListPlus, MoreVertical, Trash } from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EmailList } from "@coldjot/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSequence } from "@/lib/sequence-context";
import { SequenceListSelector } from "./sequence-list-selector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface SequenceList extends EmailList {
  _count?: {
    contacts: number;
  };
}

export function SequenceLists() {
  const { sequence, refreshSequence } = useSequence();
  const [lists, setLists] = useState<SequenceList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingList, setIsAddingList] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isRemovingList, setIsRemovingList] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLists, setTotalLists] = useState(0);
  const limit = 10;

  // Fetch sequence lists
  const fetchSequenceLists = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequence.id}/lists?page=${page}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch sequence lists");
      }

      const data = await response.json();
      setLists(data.lists);
      setTotalPages(Math.ceil(data.total / limit));
      setTotalLists(data.total);
    } catch (error) {
      console.error("Error fetching sequence lists:", error);
      toast.error("Failed to load lists");
    } finally {
      setIsLoading(false);
    }
  }, [sequence.id, page, limit]);

  useEffect(() => {
    if (sequence?.id) {
      fetchSequenceLists();
    }
  }, [page, sequence?.id]);

  // Add list to sequence
  const handleAddList = async (listId: string) => {
    try {
      setIsAddingList(true);

      // First, connect the list to the sequence
      const response = await fetch(`/api/sequences/${sequence.id}/lists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listId }),
      });

      if (!response.ok) {
        throw new Error("Failed to add list to sequence");
      }

      // Then, trigger the sync process by creating a sync record
      const syncResponse = await fetch(
        `/api/sequences/${sequence.id}/lists/${listId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!syncResponse.ok) {
        console.warn("List added but sync may be delayed");
      }

      await fetchSequenceLists();
      await refreshSequence();
      toast.success("List added to sequence");
    } catch (error) {
      console.error("Error adding list to sequence:", error);
      toast.error("Failed to add list");
    } finally {
      setIsAddingList(false);
    }
  };

  // Remove list from sequence
  const handleRemoveList = async () => {
    if (!selectedListId) return;

    try {
      setIsRemovingList(true);

      const response = await fetch(
        `/api/sequences/${sequence.id}/lists/${selectedListId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove list from sequence");
      }

      await fetchSequenceLists();
      await refreshSequence();
      toast.success("List removed from sequence");
    } catch (error) {
      console.error("Error removing list from sequence:", error);
      toast.error("Failed to remove list");
    } finally {
      setIsRemovingList(false);
      setSelectedListId(null);
    }
  };

  // Sync contacts from a specific list
  const handleSyncList = async (listId: string) => {
    try {
      const response = await fetch(
        `/api/sequences/${sequence.id}/lists/${listId}/sync`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to sync list contacts");
      }

      toast.success("List contacts synced to sequence");
      await refreshSequence();
    } catch (error) {
      console.error("Error syncing list contacts:", error);
      toast.error("Failed to sync list contacts");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Sequence Lists</h2>
        <div className="flex items-center gap-2">
          <SequenceListSelector
            onSelect={handleAddList}
            excludeIds={lists.map((list) => list.id)}
            trigger={
              <Button disabled={isAddingList} size="sm">
                {isAddingList ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ListPlus className="h-4 w-4 mr-2" />
                )}
                Add List
              </Button>
            }
          />
        </div>
      </div>

      <div className="border rounded-md">
        {isLoading ? (
          <div className="flex justify-center items-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <ListPlus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No lists added</h3>
            <p className="text-muted-foreground mb-4">
              Add lists to automatically sync contacts to this sequence
            </p>
            <SequenceListSelector
              onSelect={handleAddList}
              trigger={
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add List
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists.map((list) => (
                  <TableRow key={list.id}>
                    <TableCell className="font-medium">{list.name}</TableCell>
                    <TableCell>{list._count?.contacts || 0}</TableCell>
                    <TableCell>
                      {format(new Date(list.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {list.tags && list.tags.length > 0 ? (
                          list.tags.map((tag, i) => (
                            <Badge key={i} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No tags
                          </span>
                        )}
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
                                onClick={() => handleSyncList(list.id)}
                              >
                                <Loader2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Sync contacts from this list</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setSelectedListId(list.id)}
                            >
                              <Trash className="h-4 w-4 mr-2" />
                              Remove from sequence
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="p-4 border-t">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 1) setPage(page - 1);
                        }}
                        className={
                          page === 1 ? "pointer-events-none opacity-50" : ""
                        }
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (pageNum) => (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setPage(pageNum);
                            }}
                            isActive={pageNum === page}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < totalPages) setPage(page + 1);
                        }}
                        className={
                          page === totalPages
                            ? "pointer-events-none opacity-50"
                            : ""
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog
        open={!!selectedListId}
        onOpenChange={(open) => !open && setSelectedListId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this list from the sequence?
              Contacts from this list will no longer be automatically added to
              the sequence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveList}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemovingList ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash className="h-4 w-4 mr-2" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
