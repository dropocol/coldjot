"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "react-hot-toast";
import { Search, Loader2 } from "lucide-react";
import { Contact } from "@prisma/client";

interface ContactListSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (contacts: Contact[]) => void;
  sequenceId: string;
}

export function ContactListSelector({
  open,
  onClose,
  onSelect,
  sequenceId,
}: ContactListSelectorProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/contacts?search=${search}`);
        if (!response.ok) throw new Error("Failed to fetch contacts");
        const data = await response.json();
        setContacts(data);
      } catch (error) {
        toast.error("Failed to load contacts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchContacts();
  }, [search]);

  const handleToggleContact = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleAddContacts = async () => {
    try {
      setIsLoading(true);
      const selectedContactsList = contacts.filter((c) =>
        selectedContacts.has(c.id)
      );
      onSelect(selectedContactsList);
      onClose();
    } catch (error) {
      toast.error("Failed to add contacts");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Contacts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        contacts.length > 0 &&
                        contacts.every((c) => selectedContacts.has(c.id))
                      }
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedContacts.has(contact.id)}
                        onCheckedChange={() => handleToggleContact(contact.id)}
                      />
                    </TableCell>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell>{contact.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleAddContacts}
              disabled={selectedContacts.size === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${selectedContacts.size} Contact${
                  selectedContacts.size === 1 ? "" : "s"
                }`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
