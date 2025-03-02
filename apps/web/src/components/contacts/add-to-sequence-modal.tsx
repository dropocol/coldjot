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
import { Contact, Sequence } from "@prisma/client";
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
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  // Add debugging
  useEffect(() => {
    console.log("AddToSequenceModal props:", {
      open,
      contactsLength: contacts?.length || 0,
      contactIdsLength: contactIds?.length || 0,
      hasContact: !!contact,
      listId,
      listName,
      contactToAddToSequence: contact
        ? `${contact.firstName} ${contact.lastName} (${contact.id})`
        : null,
    });

    // Log detailed contacts information
    if (contacts && contacts.length > 0) {
      console.log("Detailed contacts information:");
      contacts.forEach((c, index) => {
        console.log(`Contact ${index}:`, {
          id: c.id || (c as any).id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          keys: Object.keys(c),
        });
      });

      // Check if contacts have only ID property
      const hasOnlyIds = contacts.some(
        (c) => Object.keys(c).length === 1 && (c.id || (c as any).id)
      );
      console.log("Contacts have only IDs:", hasOnlyIds);
    }

    // Set visibility state based on open prop
    setIsVisible(open);
  }, [open, contacts, contactIds, contact, listId, listName]);

  // Try to use the sequence context, but handle the case where it's not available
  let updateReadinessField: any = null;
  try {
    const sequenceContext = useSequence();
    updateReadinessField = sequenceContext?.updateReadinessField || null;
  } catch (error) {
    // Context not available, will use direct API call instead
    updateReadinessField = null;
  }

  // Determine if we're adding multiple contacts
  const isMultiple =
    (!!contacts && contacts.length > 1) ||
    (!!contactIds && contactIds.length > 1);
  const isSingleContactInArray = !!contacts && contacts.length === 1;
  const isFromList = !!listId;
  const allContacts = contacts.length > 0 ? contacts : contact ? [contact] : [];

  // Debug log for contacts
  if (contacts && contacts.length > 0) {
    console.log("Contacts array:", contacts);
    console.log("First contact:", contacts[0]);
    console.log(
      "Contact IDs from contacts:",
      contacts.map((c) => c.id || (c as any).id).join(", ")
    );
  }

  // Extract contact IDs, handling the case where contacts might only have IDs
  let allContactIds: string[] = [];

  if (contactIds.length > 0) {
    allContactIds = contactIds;
    console.log("Using contactIds prop:", contactIds);
  } else if (contacts.length > 0) {
    // Handle contacts that might only have an id property
    allContactIds = contacts
      .map((c) => {
        const id = c.id || (c as any).id;
        if (!id) {
          console.warn("Contact without ID:", c);
        }
        return id;
      })
      .filter(Boolean);
    console.log("Extracted IDs from contacts:", allContactIds);
  } else if (contact) {
    allContactIds = [contact.id];
    console.log("Using single contact ID:", contact.id);
  }

  console.log("Final allContactIds:", allContactIds);

  const contactsCount =
    contactIds.length || contacts.length || (contact ? 1 : 0);

  useEffect(() => {
    const fetchSequences = async () => {
      try {
        setLoading(true);
        console.log("Fetching sequences...");

        const response = await fetch("/api/sequences", {
          credentials: "include", // Include cookies for authentication
        });

        console.log("Sequences API response status:", response.status);

        if (response.status === 401) {
          console.error("Authentication error when fetching sequences");
          toast.error(
            "Authentication error. Please refresh the page and try again."
          );
          setSequences([]);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `Failed to fetch sequences: ${response.status}`,
            errorText
          );
          toast.error(`Failed to fetch sequences: ${response.statusText}`);
          setSequences([]);
          return;
        }

        const data = await response.json();
        console.log("Sequences API response data:", data);

        // Check if data is in the expected format
        if (data && typeof data === "object") {
          // Handle both array response and paginated response with sequences property
          const sequencesData = Array.isArray(data)
            ? data
            : data.sequences || [];

          console.log("Processed sequences data:", sequencesData);

          setSequences(sequencesData);
          if (sequencesData.length > 0) {
            setSelectedSequenceId(sequencesData[0].id);
          } else {
            console.log("No sequences found in the response");
          }
        } else {
          console.error("Unexpected data format:", data);
          toast.error("Received unexpected data format from server");
          setSequences([]);
        }
      } catch (error) {
        console.error("Failed to fetch sequences:", error);
        toast.error("Failed to load sequences. Please try again.");
        setSequences([]);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      fetchSequences();
    }
  }, [isVisible]);

  const handleAddToSequence = async (sequenceId: string) => {
    console.log("=== handleAddToSequence START ===");
    console.log("sequenceId:", sequenceId);
    console.log("isSingleContactInArray:", isSingleContactInArray);
    console.log("isFromList:", isFromList);
    console.log("isMultiple:", isMultiple);
    console.log("contacts:", contacts);
    console.log("contacts length:", contacts?.length || 0);
    console.log("contactIds:", contactIds);
    console.log("contactIds length:", contactIds?.length || 0);
    console.log("contact:", contact);
    console.log("allContactIds:", allContactIds);
    console.log("allContactIds length:", allContactIds?.length || 0);

    if (!sequenceId) {
      console.log("No sequenceId provided, showing error");
      toast.error("Please select a sequence");
      return;
    }

    setAdding(true);
    setSelectedSequenceId(sequenceId);

    try {
      console.log("Checking which condition to use");

      // Special case: Check if we have contacts with only IDs
      if (contacts && contacts.length > 0) {
        const hasOnlyIds = contacts.some(
          (c) => Object.keys(c).length === 1 && (c.id || (c as any).id)
        );

        if (hasOnlyIds) {
          console.log(
            "Detected contacts with only IDs, extracting IDs for API call"
          );
          const extractedIds = contacts
            .map((c) => c.id || (c as any).id)
            .filter(Boolean);

          if (extractedIds.length > 0) {
            console.log("Using extracted IDs:", extractedIds);

            if (extractedIds.length === 1) {
              // Single contact
              console.log("Using single extracted ID:", extractedIds[0]);
              const response = await fetch(
                `/api/sequences/${sequenceId}/contacts`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contactId: extractedIds[0],
                  }),
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                toast.error(errorData.message);
                return;
              }

              toast.success("Contact added to sequence");
              console.log("Successfully added to sequence, calling onClose");
              onClose();
              return;
            } else {
              // Multiple contacts
              console.log("Using multiple extracted IDs:", extractedIds);
              const response = await fetch(
                `/api/sequences/${sequenceId}/contacts/bulk`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contactIds: extractedIds,
                  }),
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                toast.error(errorData.message);
                return;
              }

              const data = await response.json();
              toast.success(
                `Added ${data.added} contacts to sequence${
                  data.skipped > 0
                    ? ` (${data.skipped} already in sequence)`
                    : ""
                }`
              );
              console.log("Successfully added to sequence, calling onClose");
              onClose();
              return;
            }
          }
        }
      }

      if (isFromList) {
        console.log("Using isFromList condition with listId:", listId);
        // Add all contacts from a list
        const response = await fetch(
          `/api/sequences/${sequenceId}/contacts/from-list`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              listId,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.message);
          return;
        }

        const data = await response.json();
        console.log("API response data:", data);
        toast.success(
          `Added ${data.added} contacts from ${listName} to sequence`
        );
      } else if (isMultiple) {
        console.log(
          "Using isMultiple condition with allContactIds:",
          allContactIds
        );
        // Add multiple contacts using their IDs
        // Use the bulk endpoint
        console.log("Using bulk endpoint with contactIds:", allContactIds);

        // Ensure we have valid contact IDs
        if (!allContactIds.length) {
          console.error("No valid contact IDs found");
          toast.error("No valid contact IDs found");
          setAdding(false);
          return;
        }

        const response = await fetch(
          `/api/sequences/${sequenceId}/contacts/bulk`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contactIds: allContactIds,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.message);
          return;
        }

        const data = await response.json();
        console.log("API response data:", data);

        toast.success(
          `Added ${data.added} contacts to sequence${
            data.skipped > 0 ? ` (${data.skipped} already in sequence)` : ""
          }`
        );
      } else if (isSingleContactInArray && contacts.length > 0) {
        // Handle single contact from contacts array
        console.log("Using single contact from contacts array:", contacts[0]);

        // Get the contact ID, handling the case where it might only have an id property
        const contactId = contacts[0].id || (contacts[0] as any).id;

        if (!contactId) {
          console.error("No valid contact ID found in contacts array");
          console.log("Contact data:", contacts[0]);
          toast.error("No valid contact ID found");
          setAdding(false);
          return;
        }

        // Use direct API call for single contact
        console.log(
          "Using direct API call for single contact from array with ID:",
          contactId
        );
        const response = await fetch(`/api/sequences/${sequenceId}/contacts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactId: contactId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.message);
          return;
        }

        const data = await response.json();
        console.log("API response data:", data);

        toast.success("Contact added to sequence");
      } else if (contact) {
        console.log("Using contact condition with contact ID:", contact.id);
        // Add a single contact
        if (updateReadinessField) {
          console.log("Using client action with updateReadinessField");
          // Use the client action if sequence context is available
          await addContactToSequence(
            sequenceId,
            contact.id,
            updateReadinessField
          );
        } else {
          console.log("Using direct API call for single contact");
          // Use direct API call if sequence context is not available
          const response = await fetch(
            `/api/sequences/${sequenceId}/contacts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contactId: contact.id,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            toast.error(errorData.message);
            return;
          }

          const data = await response.json();
          console.log("API response data:", data);
        }

        toast.success("Contact added to sequence");
      } else if (allContactIds.length > 0) {
        // Fallback: Use allContactIds if we have them but none of the above conditions matched
        console.log("Using fallback with allContactIds:", allContactIds);

        // Use the appropriate endpoint based on the number of contact IDs
        if (allContactIds.length === 1) {
          // Single contact
          console.log(
            "Using direct API call for single contact ID:",
            allContactIds[0]
          );
          const response = await fetch(
            `/api/sequences/${sequenceId}/contacts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contactId: allContactIds[0],
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            toast.error(errorData.message);
            return;
          }

          const data = await response.json();
          console.log("API response data:", data);

          toast.success("Contact added to sequence");
        } else {
          // Multiple contacts
          console.log("Using bulk endpoint with contactIds:", allContactIds);
          const response = await fetch(
            `/api/sequences/${sequenceId}/contacts/bulk`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contactIds: allContactIds,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            toast.error(errorData.message);
            return;
          }

          const data = await response.json();
          console.log("API response data:", data);

          toast.success(
            `Added ${data.added} contacts to sequence${
              data.skipped > 0 ? ` (${data.skipped} already in sequence)` : ""
            }`
          );
        }
      } else {
        // Last resort fallback - try to extract any contact IDs we can find
        console.log(
          "No standard condition matched, trying to extract any valid contact IDs"
        );

        let lastResortContactIds: string[] = [];

        // Try to extract from contacts array
        if (contacts && contacts.length > 0) {
          const extractedIds = contacts
            .map((c) => {
              // Try different ways to access the ID
              const possibleId = c.id || (c as any).id;
              if (possibleId) return possibleId;

              // Log the contact object for debugging
              console.log("Contact without clear ID:", c);
              return null;
            })
            .filter(Boolean);

          if (extractedIds.length > 0) {
            lastResortContactIds = extractedIds;
            console.log("Extracted IDs from contacts:", lastResortContactIds);
          }
        }

        // If we found any IDs, use them
        if (lastResortContactIds.length > 0) {
          console.log("Using last resort contact IDs:", lastResortContactIds);

          if (lastResortContactIds.length === 1) {
            // Single contact
            console.log(
              "Using single contact ID as last resort:",
              lastResortContactIds[0]
            );
            const response = await fetch(
              `/api/sequences/${sequenceId}/contacts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contactId: lastResortContactIds[0],
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              toast.error(errorData.message);
              return;
            }

            toast.success("Contact added to sequence");
          } else {
            // Multiple contacts
            console.log(
              "Using multiple contact IDs as last resort:",
              lastResortContactIds
            );
            const response = await fetch(
              `/api/sequences/${sequenceId}/contacts/bulk`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contactIds: lastResortContactIds,
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              toast.error(errorData.message);
              return;
            }

            const data = await response.json();
            toast.success(
              `Added ${data.added} contacts to sequence${
                data.skipped > 0 ? ` (${data.skipped} already in sequence)` : ""
              }`
            );
          }
        } else {
          console.error(
            "No condition matched and no valid contact IDs could be found!"
          );
          console.log("isFromList:", isFromList);
          console.log("isMultiple:", isMultiple);
          console.log("isSingleContactInArray:", isSingleContactInArray);
          console.log("contact:", contact);
          console.log("contacts:", contacts);
          console.log("contactIds:", contactIds);
          console.log("allContactIds:", allContactIds);
          toast.error("Failed to determine how to add contact(s) to sequence");
          setAdding(false);
          return;
        }
      }

      console.log("Successfully added to sequence, calling onClose");
      onClose();
    } catch (error) {
      console.error("Failed to add to sequence:", error);
      toast.error("Failed to add to sequence");
    } finally {
      console.log("=== handleAddToSequence END ===");
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
    title = `Add ${contactsCount} Contacts to Sequence`;
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
      open={isVisible}
      onOpenChange={(isOpen) => {
        console.log(
          "Sheet onOpenChange:",
          isOpen,
          "Previous open state:",
          isVisible
        );
        if (!isOpen) {
          // Simply call onClose directly when the sheet is closed
          setIsVisible(false);
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
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

        <div className="relative min-h-[300px] max-h-[400px] overflow-auto rounded-md border mt-4">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredSequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
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
                    <TableCell className="font-medium">
                      {sequence.name}
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
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToSequence(sequence.id);
                        }}
                        disabled={adding}
                      >
                        {adding && selectedSequenceId === sequence.id ? (
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
            disabled={!selectedSequenceId || adding}
            onClick={() => {
              if (selectedSequenceId) {
                handleAddToSequence(selectedSequenceId);
              }
            }}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4 mr-2" />
                {isFromList
                  ? "Add List to Sequence"
                  : isMultiple
                    ? `Add ${contactsCount} Contacts`
                    : isSingleContactInArray
                      ? "Add Contact"
                      : "Add Contact"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
