"use client";

import { useState, useEffect } from "react";
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

export default function ListDetailsView() {
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
  const [contactToAddToSequence, setContactToAddToSequence] =
    useState<Contact | null>(null);
  const [contactsToAddToSequence, setContactsToAddToSequence] = useState<
    Contact[]
  >([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showAddAllToSequenceModal, setShowAddAllToSequenceModal] =
    useState(false);

  // Get pagination values from URL or use defaults
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "10");

  useEffect(() => {
    fetchList();
  }, [page, limit]);

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
    if (!list) return;

    try {
      // Get all contacts to exclude the selected ones
      const allContactIds = await getAllContactIds(list.id);
      const updatedContacts = allContactIds.filter(
        (id) => !selectedContacts.has(id)
      );

      const response = await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contacts: updatedContacts,
        }),
      });

      if (!response.ok) throw new Error("Failed to remove contacts from list");

      // Refresh the list to get updated data
      fetchList();

      // Clear selection
      setSelectedContacts(new Set());

      toast.success(`${selectedContacts.size} contacts removed from list`);
    } catch (error) {
      console.error("Failed to remove contacts:", error);
      toast.error("Failed to remove contacts from list");
    }
  };

  // TODO :  check if this is correct and needed
  // Helper function to get all contact IDs for a list
  const getAllContactIds = async (listId: string): Promise<string[]> => {
    try {
      // Fetch all contacts (without pagination) to get their IDs
      const response = await fetch(`/api/lists/${listId}/contacts`);
      if (!response.ok) throw new Error("Failed to fetch all contacts");
      const data = await response.json();
      return data.contacts.map((c: Contact) => c.id);
    } catch (error) {
      console.error("Failed to fetch all contact IDs:", error);
      // Fallback to current page contacts if we can't get all
      return list?.contacts.map((c) => c.id) || [];
    }
  };

  const handleBulkAddToSequence = () => {
    if (!list || selectedContacts.size === 0) return;

    // Get all selected contacts
    const selectedContactsList = list.contacts.filter((c) =>
      selectedContacts.has(c.id)
    );

    setContactsToAddToSequence(selectedContactsList);
    setShowSequenceModal(true);
  };

  const handleSingleAddToSequence = (contact: Contact) => {
    setContactToAddToSequence(contact);
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!list) return;

    try {
      // Get all contacts to exclude the one to remove
      const allContactIds = await getAllContactIds(list.id);
      const updatedContacts = allContactIds.filter((id) => id !== contactId);

      const response = await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contacts: updatedContacts,
        }),
      });

      if (!response.ok) throw new Error("Failed to update list");

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

  const handleCloseSequenceModal = () => {
    setContactToAddToSequence(null);
    setContactsToAddToSequence([]);
    setShowSequenceModal(false);
  };

  const handleAddAllToSequence = () => {
    if (!list) return;
    setShowAddAllToSequenceModal(true);
  };

  const handleCloseAddAllToSequenceModal = () => {
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
    <>
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
              This will remove the contact from this list. The contact will not
              be deleted from your contacts.
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

      {/* Modal for single contact */}
      {contactToAddToSequence && (
        <AddToSequenceModal
          open={!!contactToAddToSequence}
          onClose={() => setContactToAddToSequence(null)}
          contact={contactToAddToSequence}
        />
      )}

      {/* Modal for multiple contacts */}
      {contactsToAddToSequence.length > 0 && (
        <AddToSequenceModal
          open={showSequenceModal}
          onClose={handleCloseSequenceModal}
          contacts={contactsToAddToSequence}
        />
      )}

      {/* Modal for adding all contacts from the list */}
      {list && (
        <AddToSequenceModal
          open={showAddAllToSequenceModal}
          onClose={handleCloseAddAllToSequenceModal}
          listId={list.id}
          listName={list.name}
          contactCount={total}
        />
      )}
    </>
  );
}
