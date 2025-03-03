"use client";

import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Trash2,
  ArrowLeft,
  MoreHorizontal,
  SendHorizonal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailList } from "@coldjot/types";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Contact } from "@prisma/client";
import ContactDetailsDrawer from "@/components/contacts/contact-details-drawer";
import { PaginationControls } from "@/components/pagination";
import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type EmailListWithContacts = Omit<EmailList, "contacts"> & {
  contacts: Contact[];
  _pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    nextPage?: number;
  };
};

interface ListDetailsViewProps {
  onSelectedContactsChange?: (contactIds: string[]) => void;
  onContactsToAddChange?: (contacts: Contact[]) => void;
  showHeader?: boolean;
}

export const ListDetailsView = memo(
  forwardRef<
    { fetchList: () => Promise<void>; getContacts: () => Contact[] },
    ListDetailsViewProps
  >(function ListDetailsView(
    { onSelectedContactsChange, onContactsToAddChange, showHeader = true },
    ref
  ) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [list, setList] = useState<EmailListWithContacts | null>(null);
    const [loading, setLoading] = useState(true);
    const [contactToRemove, setContactToRemove] = useState<string | null>(null);
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
      new Set()
    );
    const [selectedContactForDetails, setSelectedContactForDetails] =
      useState<Contact | null>(null);
    const [total, setTotal] = useState(0);
    const [contactsToAddToSequence, setContactsToAddToSequence] = useState<
      Contact[]
    >([]);
    const [showSequenceModal, setShowSequenceModal] = useState(false);
    const [showAddAllToSequenceModal, setShowAddAllToSequenceModal] =
      useState(false);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    // Get pagination values from URL or use defaults
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");

    const fetchList = async () => {
      try {
        // Get list ID from URL
        const listId = window.location.pathname.split("/").pop();
        const queryParams = new URLSearchParams();
        queryParams.set("page", page.toString());
        queryParams.set("limit", limit.toString());

        const response = await fetch(
          `/api/lists/${listId}?${queryParams.toString()}`
        );
        if (!response.ok) throw new Error("Failed to fetch list");
        const data = await response.json();
        setList(data);
        setTotal(data._pagination?.total || 0);

        // Clear selection when page changes
        setSelectedContacts(new Set());
      } catch (error) {
        console.error("Failed to fetch list:", error);
        toast.error("Failed to load list details");
      } finally {
        setLoading(false);
      }
    };

    // Expose the fetchList method to parent components
    useImperativeHandle(ref, () => ({
      fetchList,
      getContacts: () => list?.contacts || [],
    }));

    useEffect(() => {
      fetchList();
    }, [page, limit]);

    // Notify parent component when selected contacts change
    useEffect(() => {
      if (onSelectedContactsChange) {
        const contactIds = Array.from(selectedContacts);
        // Only update if the values are different to prevent infinite loops
        onSelectedContactsChange(contactIds);
      }
    }, [selectedContacts]);

    const handleCheckboxChange = (contactId: string, checked: boolean) => {
      setSelectedContacts((prev) => {
        const next = new Set(prev);
        if (checked) {
          next.add(contactId);
        } else {
          next.delete(contactId);
        }
        return next;
      });
    };

    const handleBulkRemove = async () => {
      if (!list || selectedContacts.size === 0) return;

      try {
        const response = await fetch(`/api/lists/${list.id}/contacts`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactIds: Array.from(selectedContacts),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to remove contacts from list");
        }

        const data = await response.json();

        // Refresh the list to get updated data
        fetchList();

        // Clear selection
        setSelectedContacts(new Set());

        toast.success(`${data.removed} contacts removed from list`);
      } catch (error) {
        console.error("Failed to remove contacts:", error);
        toast.error("Failed to remove contacts from list");
      }
    };

    const handleBulkAddToSequence = useCallback(() => {
      // Filter selected contacts from the list
      const selectedContactsList =
        list?.contacts.filter((c) => selectedContacts.has(c.id)) || [];

      // Set the contacts to add to sequence
      setContactsToAddToSequence(selectedContactsList);

      // Show the sequence modal
      setShowSequenceModal(true);
    }, [list, selectedContacts]);

    const handleSingleAddToSequence = useCallback(
      (contact: Contact) => {
        console.log(
          "handleSingleAddToSequence called with contact:",
          contact.email,
          contact.id
        );
        console.log("Full contact object:", contact);
        console.log("onContactsToAddChange exists:", !!onContactsToAddChange);

        if (onContactsToAddChange) {
          // Pass the contact ID instead of the full contact object
          console.log("Calling parent's onContactsToAddChange with contact ID");
          onContactsToAddChange([{ id: contact.id } as Contact]);
        } else {
          console.log("Setting contactsToAddToSequence and showSequenceModal");
          // Use the same approach as bulk add to sequence
          // Ensure we're passing the full contact object
          setContactsToAddToSequence([
            {
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              name: contact.name || `${contact.firstName} ${contact.lastName}`,
            } as Contact,
          ]);
          console.log("Contact added to contactsToAddToSequence:", contact.id);
          setShowSequenceModal(true);
        }
      },
      [onContactsToAddChange]
    );

    const handleCloseSequenceModal = useCallback(() => {
      console.log("Closing sequence modal");
      console.log("Current contactsToAddToSequence:", contactsToAddToSequence);
      setShowSequenceModal(false);
      setContactsToAddToSequence([]);
      console.log("Reset contactsToAddToSequence to empty array");
    }, [contactsToAddToSequence]);

    const handleRemoveContact = async (contactId: string) => {
      if (!list) return;

      try {
        // Use the DELETE endpoint directly with a single contact ID
        const response = await fetch(`/api/lists/${list.id}/contacts`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactIds: [contactId],
          }),
        });

        if (!response.ok) throw new Error("Failed to remove contact from list");

        // Refresh the list to get updated data
        fetchList();

        toast.success("Contact removed from list");
      } catch (error) {
        console.error("Failed to remove contact:", error);
        toast.error("Failed to remove contact");
      } finally {
        setContactToRemove(null);
      }
    };

    const handlePageChange = (newPage: number) => {
      const listId = window.location.pathname.split("/").pop();
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", newPage.toString());
      router.push(`/lists/${listId}?${params.toString()}`);
    };

    const handlePageSizeChange = (newLimit: number) => {
      const listId = window.location.pathname.split("/").pop();
      const params = new URLSearchParams(searchParams.toString());
      params.set("limit", newLimit.toString());
      params.set("page", "1"); // Reset to first page when changing page size
      router.push(`/lists/${listId}?${params.toString()}`);
    };

    const handleAddAllToSequence = () => {
      if (!list) return;
      setShowAddAllToSequenceModal(true);
    };

    const handleCloseAddAllToSequenceModal = () => {
      console.log("Closing add all to sequence modal");
      setShowAddAllToSequenceModal(false);
    };

    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="space-y-4 text-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3 w-96 rounded bg-muted" />
            </div>
          </div>
        </div>
      );
    }

    if (!list) {
      return <div>List not found</div>;
    }

    return (
      <div className="flex flex-col h-full">
        {showHeader && (
          <PageHeader
            title={list.name}
            description={list.description || "No description"}
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleAddAllToSequence}>
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Add All to Sequence
                </Button>
                {selectedContacts.size > 0 && (
                  <>
                    <Button variant="default" onClick={handleBulkAddToSequence}>
                      <SendHorizonal className="h-4 w-4 mr-2" />
                      Send {selectedContacts.size} to Sequence
                    </Button>
                    <Button variant="destructive" onClick={handleBulkRemove}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove {selectedContacts.size} Selected
                    </Button>
                  </>
                )}
              </div>
            }
          />
        )}

        <div className="space-y-4">
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        list.contacts.length > 0 &&
                        selectedContacts.size === list.contacts.length
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedContacts(
                            new Set(list.contacts.map((c) => c.id))
                          );
                        } else {
                          setSelectedContacts(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.contacts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-6 text-muted-foreground"
                    >
                      No contacts in this list
                    </TableCell>
                  </TableRow>
                ) : (
                  list.contacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={(e) => {
                        if (
                          !(e.target as HTMLElement).closest(
                            ".checkbox-cell, .action-cell, a"
                          )
                        ) {
                          setSelectedContactForDetails(contact);
                        }
                      }}
                    >
                      <TableCell
                        className="checkbox-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={(checked) =>
                            handleCheckboxChange(contact.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground/70" />
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {contact.firstName} {contact.lastName}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>{contact.email}</TableCell>
                      <TableCell className="action-cell">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleAddToSequence(contact);
                            }}
                          >
                            <SendHorizonal className="h-4 w-4" />
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
                                  setContactToRemove(contact.id);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove from List
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            currentPage={page}
            totalPages={Math.ceil(total / limit)}
            pageSize={limit}
            totalItems={total}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>

        <AlertDialog
          open={!!contactToRemove}
          onOpenChange={() => setContactToRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove contact from list?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the contact from this list. The contact will
                not be deleted from your contacts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (contactToRemove) {
                    handleRemoveContact(contactToRemove);
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedContactForDetails && (
          <ContactDetailsDrawer
            contact={selectedContactForDetails}
            open={!!selectedContactForDetails}
            onClose={() => setSelectedContactForDetails(null)}
          />
        )}

        {/* Modal for contacts - only show if parent doesn't handle it */}
        {!onContactsToAddChange && (
          <AddToSequenceModal
            open={showSequenceModal}
            onClose={handleCloseSequenceModal}
            contacts={contactsToAddToSequence}
          />
        )}

        {/* Modal for adding all contacts from the list - only show if parent doesn't handle it */}
        {list && !onContactsToAddChange && (
          <AddToSequenceModal
            open={showAddAllToSequenceModal}
            onClose={handleCloseAddAllToSequenceModal}
            listId={list.id}
            listName={list.name}
            contactCount={total}
          />
        )}
      </div>
    );
  })
);
