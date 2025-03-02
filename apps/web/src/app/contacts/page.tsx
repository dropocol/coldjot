"use client";

import { useState } from "react";
import { Plus, SendHorizonal, ListPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@/components/ui/local-search";
import { Button } from "@/components/ui/button";
import { ContactList } from "../../components/contacts/contact-list";
import { Separator } from "@/components/ui/separator";
import AddContactModal from "@/components/contacts/add-contact-drawer";
import { Contact } from "@prisma/client";
import { usePagination } from "@/hooks/use-pagination";
import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
import { AddToListDrawer } from "@/components/lists/add-to-list-drawer";
import { toast } from "react-hot-toast";

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactsToAddToSequence, setContactsToAddToSequence] = useState<
    Contact[]
  >([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [showAddToListDrawer, setShowAddToListDrawer] = useState(false);
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
    console.log(
      "handleContactsToAddChange called with",
      contactsToAdd.length,
      "contacts"
    );

    // Log the contact IDs instead of emails
    console.log("Contact IDs:", contactsToAdd.map((c) => c.id).join(", "));

    // Store the contact IDs for the modal
    setContactsToAddToSequence(contactsToAdd);
    console.log("Setting showSequenceModal to true");
    setShowSequenceModal(true);
  };

  const handleBulkAddToSequence = () => {
    if (selectedContacts.length === 0) return;

    console.log(
      "handleBulkAddToSequence called with",
      selectedContacts.length,
      "contact IDs"
    );

    console.log("Selected contact IDs:", selectedContacts.join(", "));

    // Create contact objects with just IDs for the modal
    const contactObjects = selectedContacts.map((id) => ({ id }) as Contact);
    setContactsToAddToSequence(contactObjects);

    console.log("showSequenceModal:", showSequenceModal);
    console.log("contactsToAddToSequence length:", contactObjects.length);
    setShowSequenceModal(true);
  };

  const handleBulkAddToList = () => {
    if (selectedContacts.length === 0) return;
    setShowAddToListDrawer(true);
  };

  const handleCloseSequenceModal = () => {
    console.log("Closing sequence modal");
    setShowSequenceModal(false);
  };

  const handleCloseAddToListDrawer = () => {
    setShowAddToListDrawer(false);
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
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddContact}
        />
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
    </div>
  );
}
