"use client";

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, memo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { User, Trash2, MoreHorizontal, SendHorizonal } from "lucide-react";
import { Button } from "@coldjot/ui/components/button";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coldjot/ui/components/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { Checkbox } from "@coldjot/ui/components/checkbox";
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
} from "@coldjot/ui/components/dropdown-menu";
import { useListDetail, useRemoveContactsFromList } from "@/hooks/queries/use-lists";

type EmailListWithContacts = {
  id: string;
  name: string;
  description?: string | null;
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
    const params = useParams<{ id: string }>();
    const listId = params?.id ?? "";

    const [contactToRemove, setContactToRemove] = useState<string | null>(null);
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [selectedContactForDetails, setSelectedContactForDetails] = useState<Contact | null>(
      null
    );
    const [contactsToAddToSequence, setContactsToAddToSequence] = useState<Contact[]>([]);
    const [showSequenceModal, setShowSequenceModal] = useState(false);
    const [showAddAllToSequenceModal, setShowAddAllToSequenceModal] = useState(false);

    // Get pagination values from URL or use defaults
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");

    const {
      data: list,
      isLoading: loading,
      refetch,
    } = useListDetail(listId, {
      page,
      limit,
    });
    const removeContacts = useRemoveContactsFromList(listId);

    const listData = list as EmailListWithContacts | undefined;
    const total = listData?._pagination?.total ?? 0;

    // Clear selection when the page changes.
    useEffect(() => {
      setSelectedContacts(new Set());
    }, [page, limit]);

    // Expose fetchList (refetch) + getContacts to parent components.
    useImperativeHandle(ref, () => ({
      fetchList: async () => {
        await refetch();
      },
      getContacts: () => listData?.contacts ?? [],
    }));

    // Notify parent component when selected contacts change
    useEffect(() => {
      if (onSelectedContactsChange) {
        const contactIds = Array.from(selectedContacts);
        // Only update if the values are different to prevent infinite loops
        onSelectedContactsChange(contactIds);
      }
      // Intentionally only re-runs when the selection changes; parent callback
      // is treated as stable to avoid notification loops.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!listData || selectedContacts.size === 0) return;

      try {
        const data = await removeContacts.mutateAsync(Array.from(selectedContacts));
        setSelectedContacts(new Set());
        toast.success(`${data.removed} contacts removed from list`);
      } catch (_error) {
        toast.error("Failed to remove contacts from list");
      }
    };

    const handleBulkAddToSequence = useCallback(() => {
      // Filter selected contacts from the list
      const selectedContactsList =
        listData?.contacts.filter((c) => selectedContacts.has(c.id)) ?? [];

      // Set the contacts to add to sequence
      setContactsToAddToSequence(selectedContactsList);

      // Show the sequence modal
      setShowSequenceModal(true);
    }, [listData, selectedContacts]);

    const handleSingleAddToSequence = useCallback(
      (contact: Contact) => {
        if (onContactsToAddChange) {
          // Pass the contact ID instead of the full contact object
          onContactsToAddChange([{ id: contact.id } as Contact]);
        } else {
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
          setShowSequenceModal(true);
        }
      },
      [onContactsToAddChange]
    );

    const handleCloseSequenceModal = useCallback(() => {
      setShowSequenceModal(false);
      setContactsToAddToSequence([]);
    }, []);

    const handleRemoveContact = async (contactId: string) => {
      if (!listData) return;

      try {
        await removeContacts.mutateAsync([contactId]);
        toast.success("Contact removed from list");
      } catch (_error) {
        toast.error("Failed to remove contact");
      } finally {
        setContactToRemove(null);
      }
    };

    const handlePageChange = (newPage: number) => {
      const search = new URLSearchParams(searchParams.toString());
      search.set("page", newPage.toString());
      router.push(`/lists/${listId}?${search.toString()}`);
    };

    const handlePageSizeChange = (newLimit: number) => {
      const search = new URLSearchParams(searchParams.toString());
      search.set("limit", newLimit.toString());
      search.set("page", "1"); // Reset to first page when changing page size
      router.push(`/lists/${listId}?${search.toString()}`);
    };

    const handleAddAllToSequence = () => {
      if (!listData) return;
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

    if (!listData) {
      return <div>List not found</div>;
    }

    return (
      <div className="flex flex-col h-full">
        {showHeader && (
          <PageHeader
            title={listData.name}
            description={listData.description || "No description"}
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
                        listData.contacts.length > 0 &&
                        selectedContacts.size === listData.contacts.length
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedContacts(new Set(listData.contacts.map((c) => c.id)));
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
                {listData.contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No contacts in this list
                    </TableCell>
                  </TableRow>
                ) : (
                  listData.contacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest(".checkbox-cell, .action-cell, a")) {
                          setSelectedContactForDetails(contact);
                        }
                      }}
                    >
                      <TableCell className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
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
                              onClick={(e) => e.stopPropagation()}
                              render={<Button variant="ghost" size="icon" />}
                            >
                              <MoreHorizontal className="h-4 w-4" />
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

        <AlertDialog open={!!contactToRemove} onOpenChange={() => setContactToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove contact from list?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the contact from this list. The contact will not be deleted from
                your contacts.
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
            listId={listData.id}
            listName={listData.name}
            contactCount={total}
          />
        )}
      </div>
    );
  })
);
