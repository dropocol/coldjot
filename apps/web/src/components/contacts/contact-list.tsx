"use client";

import { useState, useEffect } from "react";
import { Contact } from "@prisma/client";
import { useRouter } from "next/navigation";
import EditContactModal from "./edit-contact-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Edit2,
  Trash2,
  Mail,
  ExternalLink,
  User,
  ListPlus,
  MoreHorizontal,
  SendHorizonal,
  UserPlus,
} from "lucide-react";
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

import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AddToListDrawer from "@/components/lists/add-to-list-drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import ContactDetailsDrawer from "./contact-details-drawer";
import { AddToSequenceModal } from "./add-to-sequence-modal";

interface ContactListProps {
  searchQuery?: string;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
  initialContacts: Contact[];
  onAddContact?: () => void;
}

// Helper function to format LinkedIn URL
const formatLinkedInUrl = (url: string | null) => {
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

export default function ContactList({
  searchQuery = "",
  onSearchStart,
  onSearchEnd,
  initialContacts,
  onAddContact,
}: ContactListProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [contactToAddToList, setContactToAddToList] =
    useState<ContactToList | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set()
  );
  const [selectedContactForDetails, setSelectedContactForDetails] =
    useState<Contact | null>(null);
  const [contactToAddToSequence, setContactToAddToSequence] =
    useState<Contact | null>(null);

  useEffect(() => {
    const fetchContacts = async () => {
      if (!isInitialLoad && searchQuery.length === 1) {
        return;
      }

      setIsLoading(true);
      onSearchStart?.();
      try {
        const url =
          searchQuery.length >= 2
            ? `/api/contacts/search?q=${encodeURIComponent(searchQuery)}`
            : "/api/contacts";

        const response = await fetch(url);
        const data = await response.json();
        setContacts(data);
      } catch (error) {
        console.error("Failed to fetch contacts:", error);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
        onSearchEnd?.();
      }
    };

    if (searchQuery.length === 0 || searchQuery.length >= 2) {
      fetchContacts();
    }
  }, [searchQuery, onSearchStart, onSearchEnd, isInitialLoad]);

  const showLoading = isLoading || isInitialLoad;
  const showEmptyState = !showLoading && contacts.length === 0;

  const handleDelete = async (contact: Contact) => {
    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setContacts(contacts.filter((c) => c.id !== contact.id));
    }
  };

  const handleComposeEmail = (contact: Contact) => {
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

  const handleBulkAddToList = () => {
    setContactToAddToList({
      id: Array.from(selectedContacts).join(","),
      isMultiple: true,
    });
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
            <UserPlus className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Add your first contact</h3>
          <p className="text-muted-foreground mb-4">
            Start building your network by adding contacts and managing their
            information in one place.
          </p>
          <Button onClick={onAddContact}>Add Contact</Button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {selectedContacts.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkAddToList}
                >
                  <ListPlus className="h-4 w-4 mr-2" />
                  Add {selectedContacts.size} to List
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border">
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
                            handleComposeEmail(contact);
                          }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContactToAddToSequence(contact);
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
        </>
      )}

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSave={(updatedContact) => {
            setContacts(
              contacts.map((c) =>
                c.id === updatedContact.id ? updatedContact : c
              )
            );
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
        open={!!contactToAddToList}
        onClose={() => setContactToAddToList(null)}
        contactId={contactToAddToList?.id || ""}
        isMultiple={contactToAddToList?.isMultiple}
      />

      {contactToAddToSequence && (
        <AddToSequenceModal
          open={!!contactToAddToSequence}
          onClose={() => setContactToAddToSequence(null)}
          contact={contactToAddToSequence}
        />
      )}
    </div>
  );
}
