"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Calendar } from "lucide-react";

import ActionButtons from "../../../components/contacts/action-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CopyButton from "@/components/common/copy";
import { Contact } from "@prisma/client";

interface ContactPageClientProps {
  contactId: string;
}

export default function ContactPageClient({
  contactId,
}: ContactPageClientProps) {
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    const fetchContact = async () => {
      try {
        const response = await fetch(`/api/contacts/${contactId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch contact");
        }
        const data = await response.json();
        setContact(data);
      } catch (error) {
        console.error("Error loading contact:", error);
      }
    };

    if (contactId) {
      fetchContact();
    }
  }, [contactId]);

  if (!contact) {
    return null; // Or loading state
  }

  const handleContactUpdate = (updatedContact: Contact) => {
    setContact(updatedContact);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`${contact.firstName} ${contact.lastName}`}
          description="View and manage contact details."
        />
        <ActionButtons
          contact={contact}
          onContactUpdate={handleContactUpdate}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Contact Information Card */}
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-[120px] text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Full Name</span>
                </div>
                <span className="font-medium">
                  {contact.firstName} {contact.lastName}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-[120px] text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${contact.email}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {contact.email}
                  </a>
                  <CopyButton textToCopy={contact.email} />
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-[120px] text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Added</span>
                </div>
                <span className="font-medium">
                  {new Date(contact.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
