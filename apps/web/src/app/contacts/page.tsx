"use client";

import { useState } from "react";
import { Plus, SendHorizonal, ListPlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { LocalSearch } from "@coldjot/ui/components/local-search";
import { Button, buttonVariants } from "@coldjot/ui/components/button";
import { Label } from "@coldjot/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@coldjot/ui/components/radio-group";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { ContactList } from "../../components/contacts/contact-list";
import { Separator } from "@coldjot/ui/components/separator";
import AddContactModal from "@/components/contacts/add-contact-drawer";
import { Contact } from "@prisma/client";
import { usePagination } from "@/hooks/use-pagination";
import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
import { AddToListDrawer } from "@/components/lists/add-to-list-drawer";
import { useBulkDeleteContacts, useRestoreContacts } from "@/hooks/queries/use-contacts";
import type { BulkDeleteMode } from "@coldjot/types";

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactsToAddToSequence, setContactsToAddToSequence] = useState<Contact[]>([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showAddToListDrawer, setShowAddToListDrawer] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<BulkDeleteMode>("soft");
  const bulkDelete = useBulkDeleteContacts();
  const restore = useRestoreContacts();
  const pagination = usePagination({ enableInfiniteScroll: false });

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleAddContact = (newContact: Contact | Contact[]) => {
    if (Array.isArray(newContact)) {
      setContacts((prev) => [...newContact, ...prev]);
    } else {
      setContacts((prev) => [newContact, ...prev]);
    }
    pagination.onPageChange(1); // Reset to first page after adding contacts
  };

  const handleSelectedContactsChange = (contactIds: string[]) => {
    setSelectedContacts(contactIds);
  };

  const handleContactsToAddChange = (contactsToAdd: Contact[]) => {
    // Store the contact IDs for the modal
    setContactsToAddToSequence(contactsToAdd);
    setShowSequenceModal(true);
  };

  const handleBulkAddToSequence = () => {
    if (selectedContacts.length === 0) return;

    // Create contact objects with just IDs for the modal
    const contactObjects = selectedContacts.map((id) => ({ id }) as Contact);
    setContactsToAddToSequence(contactObjects);

    setShowSequenceModal(true);
  };

  const handleBulkAddToList = () => {
    if (selectedContacts.length === 0) return;
    setShowAddToListDrawer(true);
  };

  const handleCloseSequenceModal = () => {
    setShowSequenceModal(false);
  };

  const handleCloseAddToListDrawer = () => {
    setShowAddToListDrawer(false);
  };

  const handleBulkDelete = async () => {
    // Capture ids before clearing selection — the Undo action needs them.
    const idsToDelete = [...selectedContacts];
    try {
      const res = await bulkDelete.mutateAsync({
        contactIds: idsToDelete,
        mode: deleteMode,
      });
      // Clear selection so the bulk bar disappears (it renders on non-empty selection).
      setSelectedContacts([]);
      setDeleteDialogOpen(false);
      if (deleteMode === "hard") {
        toast.success(`Permanently deleted ${res.deleted} contact${res.deleted === 1 ? "" : "s"}.`);
      } else {
        toast(`Moved ${res.deleted} contact${res.deleted === 1 ? "" : "s"} to trash`, {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await restore.mutateAsync(idsToDelete);
                toast.success("Contacts restored");
              } catch {
                toast.error("Failed to restore contacts");
              }
            },
          },
        });
      }
    } catch {
      toast.error("Failed to delete contacts");
    }
  };

  const openDeleteDialog = () => {
    setDeleteMode("soft");
    setDeleteDialogOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Contacts" description="Manage your contacts." />
          <div className="flex items-center gap-3">
            {selectedContacts.length > 0 ? (
              <>
                <Button variant="outline" onClick={handleBulkAddToList}>
                  <ListPlus className="h-4 w-4 mr-2" />
                  Add {selectedContacts.length} to List
                </Button>
                <Button variant="default" onClick={handleBulkAddToSequence}>
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Send {selectedContacts.length} to Sequence
                </Button>
                <Button
                  variant="destructive"
                  onClick={openDeleteDialog}
                  disabled={bulkDelete.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedContacts.length}
                </Button>
              </>
            ) : (
              <>
                <LocalSearch
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onSearch={handleSearch}
                  isLoading={isSearching}
                />
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
                <Link href="/contacts/trash" className={buttonVariants({ variant: "outline" })}>
                  <Trash2 className="h-4 w-4" />
                  Trash
                </Link>
              </>
            )}
          </div>
        </div>
        <Separator />
      </div>

      <ContactList
        searchQuery={activeSearch}
        initialContacts={contacts}
        onSearchEnd={() => setIsSearching(false)}
        onAddContact={() => setShowAddModal(true)}
        page={pagination.page}
        limit={pagination.limit}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
        onSelectedContactsChange={handleSelectedContactsChange}
        onContactsToAddChange={handleContactsToAddChange}
      />

      {showAddModal && (
        <AddContactModal onClose={() => setShowAddModal(false)} onAdd={handleAddContact} />
      )}

      {/* Modal for adding contacts to sequence */}
      <AddToSequenceModal
        open={showSequenceModal}
        onClose={handleCloseSequenceModal}
        contacts={contactsToAddToSequence}
        contactIds={selectedContacts}
      />

      {/* Drawer for adding contacts to list */}
      {selectedContacts.length > 0 && (
        <AddToListDrawer
          isVisible={showAddToListDrawer}
          setIsVisible={setShowAddToListDrawer}
          onClose={handleCloseAddToListDrawer}
          contactId={selectedContacts.join(",")}
          isMultiple={true}
        />
      )}

      {/* Bulk delete confirm dialog with soft/hard mode picker */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedContacts.length} contact
              {selectedContacts.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Choose how to delete these contacts.</AlertDialogDescription>
          </AlertDialogHeader>

          <RadioGroup
            value={deleteMode}
            onValueChange={(v) => setDeleteMode(v as BulkDeleteMode)}
            className="gap-3"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="soft" id="del-soft" className="mt-0.5" />
              <Label htmlFor="del-soft" className="flex-col items-start gap-0.5 cursor-pointer">
                <span className="font-medium">Move to trash</span>
                <span className="block text-muted-foreground text-sm font-normal leading-snug">
                  Contacts are hidden. Analytics, sequences, and threads keep their attribution.
                  Restorable.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="hard" id="del-hard" className="mt-0.5" />
              <Label htmlFor="del-hard" className="flex-col items-start gap-0.5 cursor-pointer">
                <span className="font-medium text-destructive">Delete permanently</span>
                <span className="block text-muted-foreground text-sm font-normal leading-snug">
                  Removes the contacts <strong>and all their data</strong>: analytics, events,
                  tracking, threads, sequence enrollments. Cannot be undone.
                </span>
              </Label>
            </div>
          </RadioGroup>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant={deleteMode === "hard" ? "destructive" : "default"}
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending
                ? "Deleting..."
                : deleteMode === "hard"
                  ? "Delete permanently"
                  : "Move to trash"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
