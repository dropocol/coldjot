"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Plus } from "lucide-react";
import AddTemplateModal from "./add-template-drawer";
import { Template } from "@coldjot/types";

interface AddTemplateButtonProps {
  onAddTemplate: (template: Template) => void;
}

export default function AddTemplateButton({
  onAddTemplate,
}: AddTemplateButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const handleClose = () => {
    setShowModal(false);
  };

  const handleSave = (template: Template) => {
    onAddTemplate(template);
    setShowModal(false);
  };

  return (
    <>
      <Button onClick={() => setShowModal(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Template
      </Button>

      {showModal && (
        <AddTemplateModal onClose={handleClose} onSave={handleSave} />
      )}
    </>
  );
}
