"use client";

import { useState, useRef } from "react";
import { Metadata } from "next";
import { useParams } from "next/navigation";
import { ListDetailsView } from "@/components/lists/list-details-view";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@coldjot/ui";
import { SendHorizonal, Trash2 } from "lucide-react";
import { Separator } from "@coldjot/ui";
import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
import { Contact } from "@prisma/client";
import { toast } from "react-hot-toast";
import {
  useListDetail,
  useRemoveContactsFromList,
} from "@/hooks/queries/use-lists";

const _metadata: Metadata = {
  title: "Lists | Coldjot",
  description: "View and manage your email lists",
};

export default function ListDetailsPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id ?? "";

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactsToAddToSequence, setContactsToAddToSequence] = useState<
    Contact[]
  >([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showAddAllToSequenceModal, setShowAddAllToSequenceModal] =
    useState(false);
  const listDetailsViewRef = useRef<{
    fetchList: () => Promise<void>;
    getContacts: () => Contact[];
  }>(null);

  // Header data (the inner ListDetailsView fetches its own paginated copy;
  // this query fills the page header on first paint).
  const { data: list } = useListDetail(listId, { page: 1, limit: 1 });
  const listName = list?.name ?? "";
  const listDescription = list?.description || "No description";
  const totalContacts = (list as { _pagination?: { total: number } } | undefined)
    ?._pagination?.total ?? 0;
  const removeContacts = useRemoveContactsFromList(listId);

  const handleSelectedContactsChange = (contactIds: string[]) => {
    setSelectedContacts(contactIds);
  };

  const handleContactsToAddChange = (contacts: Contact[]) => {
    // Store the contacts for the modal
    setContactsToAddToSequence(contacts);
    setShowSequenceModal(true);
  };

  const handleBulkAddToSequence = () => {
    if (selectedContacts.length === 0) {
      return;
    }

    // Create contact objects with just IDs for the modal
    const contactObjects = selectedContacts.map((id) => ({ id }) as Contact);

    setContactsToAddToSequence(contactObjects);

    setShowSequenceModal(true);
  };

  const handleAddAllToSequence = () => {
    setShowAddAllToSequenceModal(true);
  };

  const handleCloseSequenceModal = () => {
    setShowSequenceModal(false);
    setContactsToAddToSequence([]);
  };

  const handleCloseAddAllToSequenceModal = () => {
    setShowAddAllToSequenceModal(false);
  };

  const handleBulkRemove = async () => {
    if (selectedContacts.length === 0) return;

    try {
      const data = await removeContacts.mutateAsync(
        Array.from(selectedContacts)
      );

      // Refresh the list view
      if (listDetailsViewRef.current?.fetchList) {
        listDetailsViewRef.current.fetchList();
      }

      // Clear selection
      setSelectedContacts([]);

      toast.success(`${data.removed} contacts removed from list`);
    } catch (_error) {
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
