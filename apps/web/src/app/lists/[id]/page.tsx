"use client";

import { useState, useEffect, useRef } from "react";
import { Metadata } from "next";
import { ListDetailsView } from "@/components/lists/list-details-view";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { SendHorizonal, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
import { Contact } from "@prisma/client";
import { toast } from "react-hot-toast";

const metadata: Metadata = {
  title: "Lists | Coldjot",
  description: "View and manage your email lists",
};

export default function ListDetailsPage() {
  const [listName, setListName] = useState<string>("");
  const [listDescription, setListDescription] = useState<string>("");
  const [listId, setListId] = useState<string>("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactsToAddToSequence, setContactsToAddToSequence] = useState<
    Contact[]
  >([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showAddAllToSequenceModal, setShowAddAllToSequenceModal] =
    useState(false);
  const [totalContacts, setTotalContacts] = useState(0);
  const listDetailsViewRef = useRef<any>(null);

  // Debug state changes
  useEffect(() => {
    console.log("State updated:", {
      selectedContacts: selectedContacts.length,
      contactsToAddToSequence: contactsToAddToSequence.length,
      showSequenceModal,
      showAddAllToSequenceModal,
    });
  }, [
    selectedContacts,
    contactsToAddToSequence,
    showSequenceModal,
    showAddAllToSequenceModal,
  ]);

  // Get list ID from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const id = window.location.pathname.split("/").pop() || "";
      setListId(id);

      // Fetch list details for the header
      const fetchListDetails = async () => {
        try {
          const response = await fetch(`/api/lists/${id}`);
          if (response.ok) {
            const data = await response.json();
            setListName(data.name);
            setListDescription(data.description || "No description");
            setTotalContacts(data._pagination?.total || 0);
          }
        } catch (error) {
          console.error("Failed to fetch list details:", error);
        }
      };

      fetchListDetails();
    }
  }, []);

  const handleSelectedContactsChange = (contactIds: string[]) => {
    setSelectedContacts(contactIds);
  };

  const handleContactsToAddChange = (contacts: Contact[]) => {
    console.log(
      "handleContactsToAddChange called with",
      contacts.length,
      "contacts"
    );

    // Log the contact IDs
    console.log("Contact IDs:", contacts.map((c) => c.id).join(", "));

    // Store the contacts for the modal
    setContactsToAddToSequence(contacts);
    console.log("Setting showSequenceModal to true");
    setShowSequenceModal(true);
  };

  const handleBulkAddToSequence = () => {
    if (selectedContacts.length === 0) {
      console.log("No contacts selected");
      return;
    }

    console.log(
      "handleBulkAddToSequence called with",
      selectedContacts.length,
      "contact IDs"
    );

    console.log("Selected contact IDs:", selectedContacts.join(", "));

    // Create contact objects with just IDs for the modal
    const contactObjects = selectedContacts.map((id) => ({ id }) as Contact);
    console.log("Created contact objects:", contactObjects);

    setContactsToAddToSequence(contactObjects);

    console.log("showSequenceModal:", showSequenceModal);
    console.log("contactsToAddToSequence length:", contactObjects.length);
    setShowSequenceModal(true);
  };

  const handleAddAllToSequence = () => {
    setShowAddAllToSequenceModal(true);
  };

  const handleCloseSequenceModal = () => {
    console.log("Closing sequence modal");
    console.log("Current contactsToAddToSequence:", contactsToAddToSequence);
    setShowSequenceModal(false);
    setContactsToAddToSequence([]);
    console.log("Reset contactsToAddToSequence to empty array");
  };

  const handleCloseAddAllToSequenceModal = () => {
    setShowAddAllToSequenceModal(false);
  };

  const handleBulkRemove = async () => {
    if (selectedContacts.length === 0) return;

    try {
      const response = await fetch(`/api/lists/${listId}/contacts`, {
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

      // Refresh the list view
      if (listDetailsViewRef.current?.fetchList) {
        listDetailsViewRef.current.fetchList();
      }

      // Clear selection
      setSelectedContacts([]);

      toast.success(`${data.removed} contacts removed from list`);
    } catch (error) {
      console.error("Failed to remove contacts:", error);
      toast.error("Failed to remove contacts from list");
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      {/* Add debugging */}
      <div className="hidden">
        Debug: selectedContacts: {selectedContacts.length},
        contactsToAddToSequence: {contactsToAddToSequence.length},
        showSequenceModal: {String(showSequenceModal)},
        showAddAllToSequenceModal: {String(showAddAllToSequenceModal)}
      </div>

      <div className="flex flex-col gap-6">
        <PageHeader
          title={listName}
          description={listDescription}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleAddAllToSequence}>
                <SendHorizonal className="h-4 w-4 mr-2" />
                Add All to Sequence
              </Button>
              {selectedContacts.length > 0 && (
                <>
                  <Button variant="default" onClick={handleBulkAddToSequence}>
                    <SendHorizonal className="h-4 w-4 mr-2" />
                    Send {selectedContacts.length} to Sequence
                  </Button>
                  <Button variant="destructive" onClick={handleBulkRemove}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove {selectedContacts.length} Selected
                  </Button>
                </>
              )}
            </div>
          }
        />
        <Separator />
      </div>

      <ListDetailsView
        ref={listDetailsViewRef}
        onSelectedContactsChange={handleSelectedContactsChange}
        onContactsToAddChange={handleContactsToAddChange}
        showHeader={false}
      />

      {/* Modal for multiple contacts */}
      <AddToSequenceModal
        open={showSequenceModal}
        onClose={handleCloseSequenceModal}
        contacts={contactsToAddToSequence}
      />

      {/* Modal for adding all contacts from the list */}
      {listId && (
        <AddToSequenceModal
          open={showAddAllToSequenceModal}
          onClose={handleCloseAddAllToSequenceModal}
          listId={listId}
          listName={listName}
          contactCount={totalContacts}
        />
      )}
    </div>
  );
}
