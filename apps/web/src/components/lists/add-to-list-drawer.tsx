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
} from "lucide-react";
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
  const [processingStatus, setProcessingStatus] = useState<string>("");

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
    const contactIds = isMultiple ? contactId.split(",") : [contactId];
    setProcessingStatus(
      `Processing ${contactIds.length} contacts for ${selectedLists.length} lists...`
    );

    try {
      // Use the bulk endpoint for each selected list
      const results = await Promise.all(
        selectedLists.map(async (listId, index) => {
          try {
            setProcessingStatus(
              `Processing list ${index + 1} of ${selectedLists.length}...`
            );
            const response = await fetch(`/api/lists/${listId}/contacts`, {
              method: "PUT", // Use PUT for bulk operations
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ contactIds }),
            });

            const data = await response.json();

            // Handle 409 Conflict (already exists) as a partial success
            if (response.status === 409) {
              console.log(`Some contacts already in list ${listId}:`, data);
              return {
                listId,
                result: {
                  added: 0,
                  skipped: contactIds.length,
                  total: data.list?._count?.contacts || 0,
                },
                success: true,
              };
            }

            if (!response.ok) {
              console.error(`Error adding contacts to list ${listId}:`, data);
              return {
                listId,
                error: data.error || "Failed to add contacts to list",
                success: false,
              };
            }

            return {
              listId,
              result: data,
              success: true,
            };
          } catch (error) {
            console.error(`Error processing list ${listId}:`, error);
            return {
              listId,
              error: "Network error",
              success: false,
            };
          }
        })
      );

      setProcessingStatus("Finalizing...");

      // Check if any operations failed
      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        // Show errors for failed operations
        failures.forEach((failure) => {
          toast.error(`Failed to add to list: ${failure.error}`);
        });
      }

      // Count successful operations and skipped contacts
      const successResults = results.filter((r) => r.success);
      const successCount = successResults.length;

      if (successCount === 0) {
        // All operations failed
        toast.error("Failed to add contacts to any lists");
        return;
      }

      const totalAdded = successResults.reduce(
        (sum, r) => sum + (r.result.added || 0),
        0
      );
      const totalSkipped = successResults.reduce(
        (sum, r) => sum + (r.result.skipped || 0),
        0
      );

      // Show appropriate success message
      if (totalSkipped > 0) {
        toast.success(
          `Added ${totalAdded} contact${totalAdded !== 1 ? "s" : ""} to ${successCount} list${successCount !== 1 ? "s" : ""} (${totalSkipped} already in lists)`
        );
      } else {
        toast.success(
          `Added ${totalAdded} contact${totalAdded !== 1 ? "s" : ""} to ${successCount} list${successCount !== 1 ? "s" : ""}`
        );
      }

      onClose();
    } catch (error) {
      console.error("Failed to add contacts to lists:", error);
      toast.error("Failed to add contacts to lists");
    } finally {
      setProcessingStatus("");
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" />
            Add to List
          </SheetTitle>
          <SheetDescription>
            Select the lists you want to add the contact{isMultiple ? "s" : ""}{" "}
            to.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lists..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative min-h-[300px] max-h-[400px] overflow-auto rounded-md border mt-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <ListPlus className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No lists found</p>
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <ListPlus className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No lists match your search
              </p>
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
        </div>

        <SheetFooter className="mt-4">
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || selectedLists.length === 0}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {processingStatus || "Adding..."}
              </>
            ) : (
              `Add to ${selectedLists.length} List${selectedLists.length !== 1 ? "s" : ""}`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
