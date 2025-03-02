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
import { Button } from "@/components/ui/button";
import { Loader2, SendHorizonal, Search, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { Contact } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { addContactToSequence } from "@/lib/client-actions";
import { useSequence } from "@/lib/sequence-context";

interface Sequence {
  id: string;
  name: string;
  status: string;
  _count: {
    contacts: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact;
  contacts?: Contact[];
  listId?: string;
  listName?: string;
  contactCount?: number;
}

export function AddToSequenceModal({
  open,
  onClose,
  contact,
  contacts = [],
  listId,
  listName,
  contactCount,
}: Props) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);

  // Determine the mode we're operating in
  const isListMode = !!listId;
  const isMultipleMode = !isListMode && contacts && contacts.length > 0;
  const isSingleMode = !isListMode && !isMultipleMode && !!contact;

  // Get contacts to add based on the mode
  const contactsToAdd = isMultipleMode ? contacts : contact ? [contact] : [];

  // Safely use the sequence context, handling the case when it's not available
  const sequenceContext = (() => {
    try {
      return useSequence();
    } catch (error) {
      // Return a mock implementation if not in a SequenceProvider
      return {
        updateReadinessField: (field: string, value: boolean) => {
          // This is a no-op function when not in a sequence context
          console.log(
            "Sequence context not available, skipping readiness update"
          );
        },
      };
    }
  })();

  const { updateReadinessField } = sequenceContext;

  const fetchSequences = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/sequences");
      if (!response.ok) throw new Error("Failed to fetch sequences");
      const data = await response.json();
      setSequences(data.sequences || []);
    } catch (error) {
      console.error("Error fetching sequences:", error);
      toast.error("Failed to load sequences");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSequences();
    }
  }, [open]);

  const handleAddToSequence = async (sequenceId: string) => {
    if (!isListMode && contactsToAdd.length === 0) {
      toast.error("No contacts selected");
      return;
    }

    setIsAdding(true);
    try {
      let response;

      // Handle different modes
      if (isListMode) {
        // Add all contacts from a list
        response = await fetch(`/api/sequences/${sequenceId}/contacts/list`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ listId }),
        });
      } else if (isMultipleMode) {
        // Add multiple selected contacts
        response = await fetch(`/api/sequences/${sequenceId}/contacts/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactIds: contactsToAdd.map((c) => c.id),
          }),
        });
      } else {
        // Add a single contact
        response = await fetch(`/api/sequences/${sequenceId}/contacts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contactId: contactsToAdd[0].id }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to add contacts to sequence");
        return;
      }

      // Try to update readiness field, but don't fail if it's not available
      try {
        updateReadinessField("hasContacts", true);
      } catch (error) {
        console.log("Could not update sequence readiness field", error);
      }

      // Generate success message based on the mode
      let successMessage;
      if (isListMode) {
        successMessage = `Added contacts from ${listName || "list"} to sequence successfully`;
      } else if (isMultipleMode) {
        successMessage = `${contactsToAdd.length} contacts added to sequence successfully`;
      } else {
        successMessage = "Contact added to sequence successfully";
      }

      toast.success(successMessage);
      onClose();
    } catch (error) {
      console.error("Error adding contacts to sequence:", error);
      toast.error("Failed to add contacts to sequence");
    } finally {
      setIsAdding(false);
    }
  };

  const filteredSequences = sequences.filter((sequence) =>
    sequence.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Generate description text based on the mode
  const getDescriptionText = () => {
    if (isListMode) {
      return `Add ${contactCount || "all"} contacts from ${listName || "list"} to an email sequence`;
    } else if (contactsToAdd.length === 0) {
      return "No contacts selected";
    } else if (contactsToAdd.length === 1) {
      const singleContact = contactsToAdd[0];
      return `Add ${singleContact.firstName} ${singleContact.lastName} to an email sequence`;
    } else {
      return `Add ${contactsToAdd.length} contacts to an email sequence`;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SendHorizonal className="h-5 w-5" />
            {isListMode
              ? "Add List to Sequence"
              : isMultipleMode
                ? "Add Contacts to Sequence"
                : "Add Contact to Sequence"}
          </SheetTitle>
          <SheetDescription>{getDescriptionText()}</SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sequences..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="relative min-h-[300px] max-h-[400px] overflow-auto rounded-md border mt-4">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <SendHorizonal className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No sequences found
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSequences.map((sequence) => (
                  <TableRow
                    key={sequence.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      selectedSequence === sequence.id && "bg-muted"
                    )}
                    onClick={() => setSelectedSequence(sequence.id)}
                  >
                    <TableCell className="font-medium">
                      {sequence.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sequence.status === "active" ? "default" : "secondary"
                        }
                      >
                        {sequence.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">
                          {sequence._count.contacts}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToSequence(sequence.id);
                        }}
                        disabled={isAdding}
                      >
                        {isAdding && selectedSequence === sequence.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <SendHorizonal className="h-4 w-4 mr-2" />
                        )}
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <SheetFooter className="mt-4">
          <Button
            variant="default"
            className="w-full"
            disabled={!selectedSequence || isAdding}
            onClick={() => {
              if (selectedSequence) {
                handleAddToSequence(selectedSequence);
              }
            }}
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4 mr-2" />
                {isListMode
                  ? "Add List to Sequence"
                  : isMultipleMode
                    ? `Add ${contactsToAdd.length} Contacts`
                    : "Add Contact"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
