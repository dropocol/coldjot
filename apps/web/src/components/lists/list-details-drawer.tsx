"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@coldjot/ui/components/sheet";
import { Button } from "@coldjot/ui/components/button";
import { EmailList } from "@coldjot/types";
import { User, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ListDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  list: EmailList;
  onContactRemove: (contactId: string) => Promise<void>;
}

export const ListDetailsDrawer = ({
  open,
  onClose,
  list,
  onContactRemove,
}: ListDetailsDrawerProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleComposeToList = () => {
    // Store the list for the compose page
    localStorage.setItem(
      "selectedList",
      JSON.stringify({
        id: list.id,
        name: list.name,
        contacts: list.contacts,
      })
    );
    router.push("/compose");
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      setLoading(true);
      await onContactRemove(contactId);
      toast.success("Contact removed from list");
    } catch (_error) {
      toast.error("Failed to remove contact");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="data-[side=right]:w-[400px] data-[side=right]:sm:w-[540px] data-[side=right]:sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>{list.name}</span>
            <Button onClick={handleComposeToList}>
              <Mail className="h-4 w-4 mr-2" />
              Compose to List
            </Button>
          </SheetTitle>
          {list.description && (
            <p className="text-sm text-muted-foreground">{list.description}</p>
          )}
        </SheetHeader>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Contacts</h3>
            <span className="text-sm text-muted-foreground">
              {list.contacts.length} contacts
            </span>
          </div>

          <div className="space-y-2">
            {list.contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between p-3 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground/70" />
                  <div>
                    <p className="font-medium">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {contact.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  onClick={() => handleRemoveContact(contact.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
