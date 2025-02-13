"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmailList } from "@coldjot/types";
import { Prisma } from "@prisma/client";
import { Search, Plus, Loader2, AlertCircle, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AddToListDrawerProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  isMultiple?: boolean;
}

type EmailListWithCount = Prisma.EmailListGetPayload<{
  include: {
    _count: {
      select: {
        contacts: true;
      };
    };
  };
}>;

interface ListResponse {
  lists: EmailListWithCount[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

export default function AddToListDrawer({
  open,
  onClose,
  contactId,
  isMultiple = false,
}: AddToListDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lists, setLists] = useState<EmailListWithCount[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const fetchLists = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/lists");
        if (!response.ok) {
          throw new Error("Failed to fetch lists");
        }
        const data: ListResponse = await response.json();
        setLists(data.lists || []);
      } catch (error) {
        console.error("Error fetching lists:", error);
        setError("Failed to fetch lists");
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchLists();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (selectedLists.length === 0) {
      toast.error("Please select at least one list");
      return;
    }

    setIsLoading(true);
    try {
      const contactIds = isMultiple ? contactId.split(",") : [contactId];
      const promises = selectedLists.map((listId) =>
        Promise.all(
          contactIds.map((id) =>
            fetch(`/api/lists/${listId}/contacts`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ contactId: id }),
            })
          )
        )
      );

      await Promise.all(promises);
      toast.success(
        `Contact${isMultiple ? "s" : ""} added to ${
          selectedLists.length
        } list${selectedLists.length > 1 ? "s" : ""}`
      );
      onClose();
    } catch (error) {
      console.error("Error adding contacts to lists:", error);
      toast.error("Failed to add contacts to lists");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Add to List</SheetTitle>
          <SheetDescription>
            Select the lists you want to add the contact{isMultiple ? "s" : ""}{" "}
            to.
          </SheetDescription>
        </SheetHeader>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lists..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error ? (
          <div className="py-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : lists.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No lists found.</p>
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No lists match your search.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contacts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell>
                    <Checkbox
                      id={list.id}
                      checked={selectedLists.includes(list.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLists((prev) =>
                            isMultiple ? [...prev, list.id] : [list.id]
                          );
                        } else {
                          setSelectedLists((prev) =>
                            prev.filter((id) => id !== list.id)
                          );
                        }
                      }}
                    />
                  </TableCell>
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
                      <span>{list._count?.contacts ?? 0} contacts</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <SheetFooter>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || selectedLists.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add to Lists"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
