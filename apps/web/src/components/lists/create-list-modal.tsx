"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailList } from "@coldjot/types";

interface CreateListModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (list: Omit<EmailList, "id" | "createdAt" | "updatedAt">) => void;
}

export const CreateListModal = ({
  open,
  onClose,
  onCreate,
}: CreateListModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [_selectedContacts, setSelectedContacts] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      description,
      userId: "", // Will be set by the API
      contacts: [], // Will be populated by the API
      tags: [],
    });
    handleReset();
  };

  const handleReset = () => {
    setName("");
    setDescription("");
    setSelectedContacts([]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Email List</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">List Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter list name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter list description"
              rows={3}
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Create List</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
