"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@coldjot/ui/components/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { Input } from "@coldjot/ui/components/input";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import { Search, Loader2 } from "lucide-react";
import { Contact } from "@prisma/client";
import { useContacts } from "@/hooks/queries/use-contacts";

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
  sequenceId: _sequenceId,
}: ContactListSelectorProps) {
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set()
  );
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useContacts({
    page: 1,
    limit: 50,
    search: search || undefined,
  });
  const contacts = (data?.contacts ?? []) as Contact[];

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
      setIsAdding(true);
      const selectedContactsList = contacts.filter((c) =>
        selectedContacts.has(c.id)
      );
      onSelect(selectedContactsList);
      onClose();
    } finally {
      setIsAdding(false);
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
              disabled={selectedContacts.size === 0 || isAdding}
            >
              {isAdding ? (
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
