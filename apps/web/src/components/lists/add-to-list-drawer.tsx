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
import {
  Search,
  Plus,
  Loader2,
  AlertCircle,
  Users,
  ListPlus,
  CheckCircle,
  Check,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AddToListDrawerProps {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
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

export function AddToListDrawer({
  isVisible,
  setIsVisible,
  onClose,
  contactId,
  isMultiple = false,
}: AddToListDrawerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [lists, setLists] = useState<EmailListWithCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lastAddedListId, setLastAddedListId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Compute filtered lists based on search query
  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const fetchLists = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/lists");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch lists");
        }

        setLists(data.lists || []);

        // Set the first list as selected by default if we have lists
        if (data.lists && data.lists.length > 0 && !selectedListId) {
          setSelectedListId(data.lists[0].id);
        }
      } catch (error) {
        console.error("Error fetching lists:", error);
        setError("Failed to fetch lists");
      } finally {
        setIsLoading(false);
      }
    };

    if (isVisible) {
      fetchLists();
      // Reset states when opening
      setLastAddedListId(null);
    }
  }, [isVisible]);

  const handleSubmit = async () => {
    if (!selectedListId) {
      toast.error("Please select a list");
      return;
    }

    setAdding(true);
    const contactIds = isMultiple ? contactId.split(",") : [contactId];

    try {
      const response = await fetch(`/api/lists/${selectedListId}/contacts`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contactIds }),
      });

      const data = await response.json();

      // Handle 409 Conflict (already exists) as a partial success
      if (response.status === 409) {
        toast.success(data.message);
        setLastAddedListId(selectedListId);
        return;
      }

      if (!response.ok) {
        toast.error(data.message || "Failed to add contacts to list");
        return;
      }

      // Show success message
      const contactText = contactIds.length === 1 ? "contact" : "contacts";
      toast.success(`Added ${contactIds.length} ${contactText} to list`);

      // Remember the last added list
      setLastAddedListId(selectedListId);

      // Keep the drawer open and the list selection visible
    } catch (error) {
      console.error("Failed to add contacts to list:", error);
      toast.error("Failed to add contacts to list");
    } finally {
      setAdding(false);
    }
  };

  // Get the contact count for the title
  const contactCount = isMultiple ? contactId.split(",").length : 1;
  const contactText = contactCount === 1 ? "Contact" : "Contacts";

  return (
    <Sheet
      open={isVisible}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setIsVisible(false);
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-[600px] sm:max-w-[600px] flex flex-col gap-0"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" />
            Add to List
          </SheetTitle>
          <SheetDescription>
            Select a list to add {contactCount} {contactText.toLowerCase()} to.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lists..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative flex-grow overflow-auto rounded-md border mt-4 mb-4">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-[400px]">
              <p className="text-destructive mb-4">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  // Retry fetching lists
                  fetch("/api/lists")
                    .then((res) => res.json())
                    .then((data) => {
                      setLists(data.lists || []);
                      if (data.lists && data.lists.length > 0) {
                        setSelectedListId(data.lists[0].id);
                      }
                    })
                    .catch((err) => {
                      console.error("Error retrying fetch:", err);
                      setError("Failed to fetch lists");
                    })
                    .finally(() => {
                      setIsLoading(false);
                    });
                }}
              >
                Retry
              </Button>
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-[400px]">
              <p className="text-muted-foreground mb-4">No lists found</p>
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  window.location.href = "/lists/new";
                }}
              >
                Create a list
              </Button>
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-[400px]">
              <p className="text-muted-foreground">
                No lists match your search.
              </p>
            </div>
          ) : (
            <RadioGroup
              value={selectedListId || ""}
              onValueChange={setSelectedListId}
              className="w-full"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLists.map((list) => (
                    <TableRow
                      key={list.id}
                      className={cn(
                        "cursor-pointer",
                        selectedListId === list.id && "bg-muted/50"
                      )}
                      onClick={() => setSelectedListId(list.id)}
                    >
                      <TableCell className="p-2">
                        <RadioGroupItem
                          value={list.id}
                          id={list.id}
                          className="data-[state=checked]:border-primary"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Label
                          htmlFor={list.id}
                          className="cursor-pointer flex items-center gap-2"
                        >
                          {list.name}
                          {lastAddedListId === list.id && (
                            <span className="text-xs text-green-600 font-normal flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Added
                            </span>
                          )}
                        </Label>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {list._count?.contacts ?? 0}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </RadioGroup>
          )}
        </div>

        <SheetFooter className="mt-auto pt-4 border-t">
          <Button
            variant="default"
            className="w-full"
            disabled={!selectedListId || adding}
            onClick={handleSubmit}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding to List...
              </>
            ) : (
              <>
                <ListPlus className="h-4 w-4 mr-2" />
                {isMultiple
                  ? `Add ${contactCount} ${contactText} to List`
                  : "Add to Selected List"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
