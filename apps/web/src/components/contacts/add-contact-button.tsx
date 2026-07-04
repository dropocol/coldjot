"use client";

import { Plus } from "lucide-react";
import { Button } from "@coldjot/ui/components/button";
import { useState } from "react";
import AddContactModal from "./add-contact-drawer";
import { Contact } from "@prisma/client";

interface AddContactButtonProps {
  onAddContact: (contact: Contact) => void;
}

export default function AddContactButton({
  onAddContact,
}: AddContactButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowModal(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Contact
      </Button>

      {showModal && (
        <AddContactModal
          onClose={() => setShowModal(false)}
          onAdd={onAddContact}
        />
      )}
    </>
  );
}
