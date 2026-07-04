"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@coldjot/ui";
import { User, Mail, Calendar } from "lucide-react";

import ActionButtons from "../../../components/contacts/action-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@coldjot/ui";
import CopyButton from "@/components/common/copy";
import { Contact } from "@prisma/client";
import { useContact } from "@/hooks/queries/use-contacts";

interface ContactPageClientProps {
  contactId: string;
}

export default function ContactPageClient({
  contactId,
}: ContactPageClientProps) {
  const { data: contact } = useContact(contactId);

  if (!contact) {
    return null; // Or loading state
  }

  const handleContactUpdate = (_updatedContact: Contact) => {
    void _updatedContact;
    // The ActionButtons mutations invalidate qk.contacts.detail, so the
    // query above refetches automatically.
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
