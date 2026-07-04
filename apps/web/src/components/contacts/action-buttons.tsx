"use client";

import { Button } from "@coldjot/ui/components/button";
import { Mail, Edit2, Trash2, ListPlus, MoreHorizontal } from "lucide-react";
import { Contact } from "@prisma/client";
import { useState } from "react";
import EditContactModal from "./edit-contact-drawer";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";
import { AddToListDrawer } from "@/components/lists/add-to-list-drawer";
import { useDeleteContact } from "@/hooks/queries/use-contacts";

interface ActionButtonsProps {
  contact: Contact;
  onContactUpdate?: (updatedContact: Contact) => void;
}

const RECENT_CONTACTS_KEY = "recentContacts";
const MAX_RECENT_CONTACTS = 5;

export default function ActionButtons({ contact, onContactUpdate }: ActionButtonsProps) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const router = useRouter();
  const deleteContact = useDeleteContact();

  const handleSave = (updatedContact: Contact) => {
    setEditingContact(null);
    onContactUpdate?.(updatedContact);
  };

  const handleCompose = () => {
    // Store the selected contact in localStorage
    localStorage.setItem(
      "selectedContact",
      JSON.stringify({
        id: contact.id,
        name: contact.name,
        email: contact.email,
      })
    );

    // Update recent contacts
    try {
      const recentContacts = JSON.parse(localStorage.getItem(RECENT_CONTACTS_KEY) || "[]");
      const updatedRecents = [
        contact.id,
        ...recentContacts.filter((id: string) => id !== contact.id),
      ].slice(0, MAX_RECENT_CONTACTS);

      localStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(updatedRecents));
    } catch {
      // Ignore a corrupt recent-contacts payload.
    }

    router.push("/compose");
  };

  const handleDelete = async () => {
    try {
      await deleteContact.mutateAsync(contact.id);

      // Remove from recent contacts if present
      try {
        const recentContacts = JSON.parse(localStorage.getItem(RECENT_CONTACTS_KEY) || "[]");
        const updatedRecents = recentContacts.filter((id: string) => id !== contact.id);
        localStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(updatedRecents));
      } catch {
        // Ignore a corrupt recent-contacts payload.
      }

      toast.success("Contact deleted successfully");
      router.push("/contacts");
    } catch (_error) {
      toast.error("Failed to delete contact");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCompose}>
          <Mail className="h-4 w-4 mr-2" />
          Compose
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingContact(contact)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Contact
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowAddToList(true)}>
              <ListPlus className="h-4 w-4 mr-2" />
              Add to List
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSave={handleSave}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium">
                {contact.firstName} {contact.lastName}
              </span>{" "}
              and remove all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddToListDrawer
        isVisible={showAddToList}
        setIsVisible={setShowAddToList}
        onClose={() => setShowAddToList(false)}
        contactId={contact.id}
      />
    </>
  );
}
