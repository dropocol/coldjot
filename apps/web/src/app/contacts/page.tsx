"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LocalSearch } from "@/components/ui/local-search";
import { Button } from "@/components/ui/button";
import ContactList from "../../components/contacts/contact-list";
import { Separator } from "@/components/ui/separator";
import AddContactModal from "@/components/contacts/add-contact-drawer";
import { Contact } from "@prisma/client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function ContactsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    return newSearchParams.toString();
  };

  const handlePageChange = (newPage: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: newPage.toString(),
      })}`
    );
  };

  const handlePageSizeChange = (newLimit: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: "1",
        limit: newLimit.toString(),
      })}`
    );
  };

  const handleSearch = (value: string) => {
    setActiveSearch(value);
    setIsSearching(true);
  };

  const handleAddContact = (newContact: Contact) => {
    setContacts((prev) => [newContact, ...prev]);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Contacts" description="Manage your contacts." />
          <div className="flex items-center gap-3">
            <LocalSearch
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={handleSearch}
              isLoading={isSearching}
            />
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>
        <Separator />
      </div>

      <ContactList
        searchQuery={activeSearch}
        initialContacts={contacts}
        onSearchEnd={() => setIsSearching(false)}
        onAddContact={() => setShowAddModal(true)}
        page={page}
        limit={limit}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddContact}
        />
      )}
    </div>
  );
}
