"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  AlertCircle,
  Mail,
  Users,
  Tag,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailList } from "@coldjot/types";
import { CreateListModal } from "./create-list-modal";
import { toast } from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

interface EmailListsViewProps {
  searchQuery?: string;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
  showAddModal?: boolean;
  onAddModalClose?: () => void;
}

const EmailListsView = ({
  searchQuery = "",
  onSearchStart,
  onSearchEnd,
  showAddModal = false,
  onAddModalClose,
}: EmailListsViewProps) => {
  const router = useRouter();
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = async () => {
    onSearchStart?.();
    try {
      setError(null);
      const url =
        searchQuery.length >= 2
          ? `/api/lists/search?q=${encodeURIComponent(searchQuery)}`
          : "/api/lists";

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch lists");
      }

      const data = await response.json();
      setLists(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load lists";
      setError(errorMessage);
      toast.error("Failed to load email lists");
    } finally {
      setLoading(false);
      onSearchEnd?.();
    }
  };

  useEffect(() => {
    if (searchQuery.length === 0 || searchQuery.length >= 2) {
      fetchLists();
    }
  }, [searchQuery]);

  const handleCreateList = async (
    list: Omit<EmailList, "id" | "createdAt" | "updatedAt">
  ) => {
    try {
      setError(null);
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...list,
          contacts: list.contacts || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create list");
      }

      const newList = await response.json();
      setLists((prev) => [newList, ...prev]);
      toast.success("Email list created successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create email list";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDeleteList = async (list: EmailList) => {
    try {
      setError(null);
      const response = await fetch(`/api/lists/${list.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete list");
      }

      setLists((prev) => prev.filter((l) => l.id !== list.id));
      toast.success("Email list deleted successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete email list";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchLists();
  };

  const handleComposeToList = (list: EmailList) => {
    localStorage.setItem(
      "selectedList",
      JSON.stringify({
        id: list.id,
        name: list.name,
        contacts: list.contacts,
      })
    );
    router.push("/compose");
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

      {loading ? (
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
                <TableHead>Name</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow
                  key={list.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/lists/${list.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{list.name}</div>
                    {list.description && (
                      <div className="text-sm text-muted-foreground">
                        {list.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{list.contacts.length} contacts</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {list.tags && list.tags.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span>{list.tags.length} tags</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleComposeToList(list);
                        }}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
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
                              handleDeleteList(list);
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

      <CreateListModal
        open={showAddModal}
        onClose={() => onAddModalClose?.()}
        onCreate={async (list) => {
          await handleCreateList(list);
          onAddModalClose?.();
        }}
      />
    </div>
  );
};

export default EmailListsView;
