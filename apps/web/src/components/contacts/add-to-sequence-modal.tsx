"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@coldjot/ui/components/sheet";
import { Button } from "@coldjot/ui/components/button";
import { Loader2, SendHorizonal, Search, Users, Check } from "lucide-react";
import { toast } from "sonner";
import { Contact } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { Input } from "@coldjot/ui/components/input";
import { Badge } from "@coldjot/ui/components/badge";
import { cn } from "@coldjot/ui/lib/utils";

import { RadioGroup, RadioGroupItem } from "@coldjot/ui/components/radio-group";
import { Label } from "@coldjot/ui/components/label";
import { useSequences } from "@/hooks/queries/use-sequences";
import {
  useAddContactToSequence,
  useBulkAddContactsToSequence,
  useAddListContactsToSequence,
} from "@/hooks/queries/use-sequence-contacts";

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact;
  contacts?: Contact[];
  contactIds?: string[];
  listId?: string;
  listName?: string;
  contactCount?: number;
}

export function AddToSequenceModal({
  open,
  onClose,
  contact,
  contacts = [],
  contactIds = [],
  listId,
  listName,
  contactCount,
}: Props) {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastAddedSequenceId, setLastAddedSequenceId] = useState<string | null>(
    null
  );

  // Determine if we're adding multiple contacts
  const isMultiple = contacts.length > 1 || contactIds.length > 1;
  const isSingleContactInArray = contacts.length === 1;
  const isFromList = !!listId;

  // Fetch the user's sequences only while the modal is open.
  const { data: sequencesData, isLoading: loading } = useSequences({
    page: 1,
    limit: 100,
  });
  const sequences = useMemo(
    () => sequencesData?.sequences ?? [],
    [sequencesData]
  );
  const addContact = useAddContactToSequence(selectedSequenceId || "_");
  const bulkAddContacts = useBulkAddContactsToSequence(
    selectedSequenceId || "_"
  );
  const addListContacts = useAddListContactsToSequence(
    selectedSequenceId || "_"
  );

  // Default-select the first sequence once loaded.
  useEffect(() => {
    if (sequences.length > 0 && !selectedSequenceId) {
      setSelectedSequenceId(sequences[0].id);
    }
  }, [sequences, selectedSequenceId]);

  const handleAddToSequence = async () => {
    if (!selectedSequenceId) {
      toast.error("Please select a sequence");
      return;
    }

    setAdding(true);

    try {
      // Case 1: Adding all contacts from a list
      if (isFromList && listId) {
        const data = await addListContacts.mutateAsync(listId);
        toast.success(
          `Added ${data.added ?? 0} contacts from ${listName} to sequence${
            data.skipped ? ` (${data.skipped} already in sequence)` : ""
          }`
        );
        setLastAddedSequenceId(selectedSequenceId);
        return;
      }

      // Case 2: Adding multiple selected contacts
      if (isMultiple) {
        const idsToAdd =
          contactIds.length > 0
            ? contactIds
            : contacts.map((c) => c.id).filter(Boolean);

        if (idsToAdd.length === 0) {
          toast.error("No valid contact IDs found");
          return;
        }

        const data = await bulkAddContacts.mutateAsync(idsToAdd);
        toast.success(
          `Added ${data.added ?? 0} contacts to sequence${
            data.skipped ? ` (${data.skipped} already in sequence)` : ""
          }`
        );
        setLastAddedSequenceId(selectedSequenceId);
        return;
      }

      // Case 3: Adding a single contact
      const contactId = contacts[0]?.id || contact?.id;
      if (!contactId) {
        toast.error("No valid contact ID found");
        return;
      }

      await addContact.mutateAsync(contactId);
      toast.success("Contact added to sequence");
      setLastAddedSequenceId(selectedSequenceId);
    } catch (_error) {
      toast.error("Failed to add to sequence");
    } finally {
      setAdding(false);
    }
  };

  // Ensure sequences is always an array before filtering
  const filteredSequences = Array.isArray(sequences)
    ? sequences.filter((sequence) =>
        sequence.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Generate appropriate title and description based on the context
  let title = "Add to Sequence";
  let description = "Select a sequence to add the contact to.";

  if (isFromList) {
    title = `Add Contacts from ${listName} to Sequence`;
    description = `Add all ${contactCount} contacts from ${listName} to a sequence.`;
  } else if (isMultiple) {
    title = `Add ${contacts.length} Contacts to Sequence`;
    description = `Select a sequence to add the selected contacts to.`;
  } else if (isSingleContactInArray) {
    // Handle single contact from contacts array
    const contactName =
      contacts[0].firstName && contacts[0].lastName
        ? `${contacts[0].firstName} ${contacts[0].lastName}`
        : "Contact";
    title = "Add Contact to Sequence";
    description = `Add ${contactName} to a sequence.`;
  } else if (contact) {
    title = "Add Contact to Sequence";
    description = `Add ${contact.firstName} ${contact.lastName} to a sequence.`;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="data-[side=right]:w-[600px] data-[side=right]:sm:max-w-[600px] flex flex-col gap-0"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SendHorizonal className="h-5 w-5" />
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sequences..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative flex-grow overflow-auto rounded-md border mt-4 mb-4">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredSequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-[400px]">
              <p className="text-muted-foreground mb-4">No sequences found</p>
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  window.location.href = "/sequences/new";
                }}
              >
                Create a sequence
              </Button>
            </div>
          ) : (
            <RadioGroup
              value={selectedSequenceId}
              onValueChange={(v) => setSelectedSequenceId(v as string)}
              className="w-full"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSequences.map((sequence) => (
                    <TableRow
                      key={sequence.id}
                      className={cn(
                        "cursor-pointer",
                        selectedSequenceId === sequence.id && "bg-muted/50"
                      )}
                      onClick={() => setSelectedSequenceId(sequence.id)}
                    >
                      <TableCell className="p-2">
                        <RadioGroupItem
                          value={sequence.id}
                          id={sequence.id}
                          className="data-[state=checked]:border-primary"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Label
                          htmlFor={sequence.id}
                          className="cursor-pointer flex items-center gap-2"
                        >
                          {sequence.name}
                          {lastAddedSequenceId === sequence.id && (
                            <span className="text-xs text-green-600 font-normal flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Added
                            </span>
                          )}
                        </Label>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sequence.status === "active" ? "default" : "outline"
                          }
                          className="capitalize"
                        >
                          {sequence.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {typeof sequence === "object" &&
                            "_count" in sequence &&
                            sequence._count &&
                            typeof sequence._count === "object" &&
                            "contacts" in sequence._count
                              ? String(sequence._count.contacts)
                              : "0"}
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
            disabled={!selectedSequenceId || adding}
            onClick={handleAddToSequence}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding to Sequence...
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4 mr-2" />
                {isFromList
                  ? "Add List to Selected Sequence"
                  : isMultiple
                    ? `Add ${contacts.length} Contacts to Sequence`
                    : "Add to Selected Sequence"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
