"use client";

import { useState, useEffect } from "react";
import { Company, Contact } from "@prisma/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Mail, Building2, Globe, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type CompanyWithContacts = Company & {
  contacts: Contact[];
};

interface CompanyDetailsProps {
  company: CompanyWithContacts;
  onClose: () => void;
  onContactClick?: (contact: Contact) => void;
}

export default function CompanyDetails({
  company: initialCompany,
  onClose,
  onContactClick,
}: CompanyDetailsProps) {
  const [company, setCompany] = useState<CompanyWithContacts>(initialCompany);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch(`/api/companies/${company.id}/contacts`);
        if (!response.ok) throw new Error("Failed to load contacts");

        const contacts = await response.json();
        setCompany((prev) => ({ ...prev, contacts }));
      } catch (error) {
        console.error("Error loading contacts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContacts();
  }, [company.id]);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[600px] w-[90vw]">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>Company Details</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-8rem)]">
          <div className="space-y-6 py-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Building2 className="h-5 w-5" />
                {company.name}
              </div>

              {company.website && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  <a
                    href={
                      company.website.startsWith("http")
                        ? company.website
                        : `https://${company.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {company.website}
                  </a>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Contacts</h3>
                <span className="text-sm text-muted-foreground">
                  {company.contacts.length} contacts
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-20rem)]">
                  {company.contacts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {company.contacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell className="font-medium">
                              {contact.name}
                            </TableCell>
                            <TableCell>{contact.email}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onContactClick?.(contact)}
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No contacts found
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}