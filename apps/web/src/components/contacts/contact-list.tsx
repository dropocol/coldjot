"use client";

import { useState, useEffect } from "react";
import { Contact } from "@prisma/client";
import { useRouter } from "next/navigation";
import EditContactModal from "./edit-contact-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { Button } from "@coldjot/ui/components/button";
import {
  Edit2,
  Trash2,
  User,
  ListPlus,
  MoreHorizontal,
  SendHorizonal,
  Plus,
  User2,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@coldjot/ui/components/alert-dialog";

import Link from "next/link";

import { AddToListDrawer } from "@/components/lists/add-to-list-drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@coldjot/ui/components/dropdown-menu";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import ContactDetailsDrawer from "./contact-details-drawer";
import { AddToSequenceModal } from "./add-to-sequence-modal";
import { PaginationControls } from "@/components/pagination";
import { useQueryClient } from "@tanstack/react-query";
import {
  useContacts,
  useDeleteContact,
  ContactsListResponse,
} from "@/hooks/queries/use-contacts";
import { qk } from "@/lib/query/keys";

interface ContactListProps {
  searchQuery?: string;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
  initialContacts: Contact[];
  onAddContact?: () => void;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectedContactsChange?: (contactIds: string[]) => void;
  onContactsToAddChange?: (contacts: Contact[]) => void;
}

// Helper function to format LinkedIn URL
const _formatLinkedInUrl = (url: string | null) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/^\/|\/$/g, "");
    const profileName = path.split("/").pop();
    return profileName || url;
  } catch {
    return url;
  }
};

interface ContactToList {
  id: string;
  isMultiple?: boolean;
}

export function ContactList({
  searchQuery = "",
  onSearchStart,
  onSearchEnd,
  initialContacts,
  onAddContact,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
  onSelectedContactsChange,
  onContactsToAddChange,
}: ContactListProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [contactToAddToList, setContactToAddToList] =
    useState<ContactToList | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set()
  );
  const [selectedContactForDetails, setSelectedContactForDetails] =
    useState<Contact | null>(null);
  const [contactToAddToSequence, setContactToAddToSequence] =
    useState<Contact | null>(null);

  // Only fetch when the search query is empty or at least 2 chars (matches the
  // previous behavior of skipping single-character queries).
  const enabled = searchQuery.length === 0 || searchQuery.length >= 2;

  const { data, isLoading, isFetching } = useContacts({
    page,
    limit,
    search: searchQuery.length >= 2 ? searchQuery : undefined,
  });
  const deleteContact = useDeleteContact();

  // Surface the parent's search start/end callbacks while fetching.
  useEffect(() => {
    if (isFetching && onSearchStart) onSearchStart();
    if (!isFetching && onSearchEnd) onSearchEnd();
    // Parent callbacks are treated as stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  // Notify parent component when selected contacts change
  useEffect(() => {
    if (onSelectedContactsChange) {
      const contactIds = Array.from(selectedContacts);
      onSelectedContactsChange(contactIds);
    }
    // Intentionally only re-runs when the selection changes; the parent callback
    // is treated as stable to avoid notification loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContacts]);

  const response = data as ContactsListResponse | undefined;
  // Use the server-fetched page when available; fall back to the initial page
  // (passed from the server component) so first paint is SSR-accurate.
  const contacts = response?.contacts ?? initialContacts;
  const total = response?.total ?? initialContacts.length;
  void enabled;

  const showLoading = isLoading;
  const showEmptyState = !showLoading && contacts.length === 0;

  const handleDelete = async (contact: Contact) => {
    await deleteContact.mutateAsync(contact.id);
  };

  const _handleComposeEmail = (contact: Contact) => {
    localStorage.setItem(
      "selectedContact",
      JSON.stringify({
        id: contact.id,
        name: contact.name,
        email: contact.email,
      })
    );
    router.push("/compose");
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

  const _handleBulkAddToList = () => {
    setContactToAddToList({
      id: Array.from(selectedContacts).join(","),
      isMultiple: true,
    });
  };

  const handleAddToSequence = (contact: Contact) => {
    if (onContactsToAddChange) {
      onContactsToAddChange([{ id: contact.id } as Contact]);
    } else {
      setContactToAddToSequence(contact);
    }
  };

  return (
    <div className="space-y-4">
      {showLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="space-y-4 text-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3 w-96 rounded bg-muted" />
            </div>
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <User2 className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Add your first contact</h3>
          <p className="text-muted-foreground mb-4">
            Start adding contacts to manage your email campaigns effectively.
          </p>
          <Button onClick={onAddContact}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      ) : (
        <>
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedContacts.size === contacts.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedContacts(
                            new Set(contacts.map((c) => c.id))
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
                {contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={(e) => {
                      if (
                        !(e.target as HTMLElement).closest(".checkbox-cell")
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
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToSequence(contact);
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
                                setEditingContact(contact);
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit Contact
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setContactToAddToList({
                                  id: contact.id,
                                  isMultiple: false,
                                });
                              }}
                            >
                              <ListPlus className="h-4 w-4 mr-2" />
                              Add to List
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingContact(contact);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Contact
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

          <PaginationControls
            currentPage={page}
            totalPages={Math.ceil(total / limit)}
            pageSize={limit}
            totalItems={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSave={() => {
            // The drawer performs the PUT; invalidate so the list refetches.
            qc.invalidateQueries({ queryKey: qk.contacts.all });
            setEditingContact(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deletingContact}
        onOpenChange={() => setDeletingContact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              contact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingContact) {
                  handleDelete(deletingContact);
                  setDeletingContact(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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

      <AddToListDrawer
        isVisible={!!contactToAddToList}
        setIsVisible={(isVisible) => {
          if (!isVisible) setContactToAddToList(null);
        }}
        onClose={() => setContactToAddToList(null)}
        contactId={contactToAddToList?.id || ""}
        isMultiple={contactToAddToList?.isMultiple}
      />

      {/* Only show if parent doesn't handle it */}
      {contactToAddToSequence && !onContactsToAddChange && (
        <AddToSequenceModal
          open={!!contactToAddToSequence}
          onClose={() => setContactToAddToSequence(null)}
          contact={contactToAddToSequence}
        />
      )}
    </div>
  );
}
