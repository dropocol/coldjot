"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Contact } from "@prisma/client";
import { Mail, Building2, Globe, Calendar } from "lucide-react";
import Link from "next/link";
import { formatLinkedInUrl } from "@/lib/utils";
import ActionButtons from "./action-buttons";

interface ContactDetailsDrawerProps {
  contact: Contact;
  open: boolean;
  onClose: () => void;
}

export default function ContactDetailsDrawer({
  contact,
  open,
  onClose,
}: ContactDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold">
            {contact.firstName} {contact.lastName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <ActionButtons contact={contact} />

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground/70 mt-0.5" />
              <div>
                <p className="font-medium">{contact.email}</p>
                <p className="text-sm text-muted-foreground">Email</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground/70 mt-0.5" />
              <div>
                <p className="font-medium">
                  {new Date(contact.createdAt).toLocaleDateString()}
                </p>
                <p className="text-sm text-muted-foreground">Added on</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
