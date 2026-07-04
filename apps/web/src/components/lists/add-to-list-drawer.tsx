"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@coldjot/ui/components/sheet";
import { Input } from "@coldjot/ui/components/input";
import { Button } from "@coldjot/ui/components/button";

import { Prisma } from "@prisma/client";
import {
  Search,
  Loader2,
  Users,
  ListPlus,
  Check,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { RadioGroup, RadioGroupItem } from "@coldjot/ui/components/radio-group";
import { Label } from "@coldjot/ui/components/label";
import { cn } from "@coldjot/ui/lib/utils";
import { useLists, useAddContactsToList } from "@/hooks/queries/use-lists";
import { ApiError } from "@/lib/http/api-client";

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

export function AddToListDrawer({
  isVisible,
  setIsVisible,
  onClose,
  contactId,
  isMultiple = false,
}: AddToListDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lastAddedListId, setLastAddedListId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useLists({ page: 1, limit: 100 });
  const lists = useMemo(
    () => (data?.lists ?? []) as unknown as EmailListWithCount[],
    [data]
  );

  // Mutations are bound per-call, so use a queryClient-driven flow here.
  // We need the selectedListId before instantiating the hook; use a sentinel
  // and call the hook with the real id once selected.
  const addContacts = useAddContactsToList(selectedListId ?? "_");

  // Default-select the first list when loaded.
  useEffect(() => {
    if (lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  // Reset state when the drawer is reopened.
  useEffect(() => {
    if (isVisible) setLastAddedListId(null);
  }, [isVisible]);

  // Compute filtered lists based on search query
  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedListId) {
      toast.error("Please select a list");
      return;
    }

    const contactIds = isMultiple ? contactId.split(",") : [contactId];

    try {
      setError(null);
      // Rebind to the selected list. The hook was instantiated with the
      // sentinel above; mutate via a fresh client call instead.
      const data = await addContacts.mutateAsync(contactIds);

      // Show success message
      const contactText = contactIds.length === 1 ? "contact" : "contacts";
      toast.success(`Added ${contactIds.length} ${contactText} to list`);

      // Remember the last added list
      setLastAddedListId(selectedListId);
      void data;
    } catch (err) {
      // 409 Conflict (all contacts already in the list) is a partial success.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { message?: string } | null;
        toast.success(body?.message ?? "Contacts already in list");
        setLastAddedListId(selectedListId);
        return;
      }
      setError("Failed to add contacts to list");
      toast.error("Failed to add contacts to list");
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
                  void refetch();
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
            disabled={!selectedListId || addContacts.isPending}
            onClick={handleSubmit}
          >
            {addContacts.isPending ? (
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
