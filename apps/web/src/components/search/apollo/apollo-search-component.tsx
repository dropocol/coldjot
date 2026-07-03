"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Search,
  Mail,
  Building2,
  UserPlus,
  CheckCircle,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type FormData = {
  domain: string;
};

type ApolloContact = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  title: string;
  organization_name: string;
  linkedin_url?: string;
  enriched?: boolean;
  organization?: {
    name: string;
    primary_domain: string;
    website_url?: string;
  };
  account?: {
    domain: string;
    website_url?: string;
  };
  city?: string;
  state?: string;
  country?: string;
};

interface Props {
  userId: string;
}

export default function ApolloSearchComponent({ userId }: Props) {
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState<Record<string, boolean>>({});
  const [searchResults, setSearchResults] = useState<ApolloContact[]>([]);
  const { register, handleSubmit } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setIsSearching(true);
    try {
      const response = await fetch("/api/search/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: data.domain,
          titles: ["ceo", "cto", "founder", "co-founder"],
        }),
      });

      if (!response.ok) throw new Error("Search failed");

      const result = await response.json();
      setSearchResults([...(result.people || []), ...(result.contacts || [])]);
    } catch (error) {
      toast.error("Failed to search contacts");
    } finally {
      setIsSearching(false);
    }
  };

  const enrichContact = async (contact: ApolloContact) => {
    setIsEnriching((prev) => ({ ...prev, [contact.id]: true }));
    try {
      const response = await fetch("/api/search/apollo/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apolloContactId: contact.id,
          domain:
            contact.organization?.primary_domain ||
            contact.account?.domain ||
            contact.organization_name.toLowerCase().replace(/[^a-z0-9]/g, "") +
              ".com",
          firstName: contact.first_name,
          lastName: contact.last_name,
        }),
      });

      if (!response.ok) throw new Error("Enrichment failed");

      const enrichedData = await response.json();
      const enrichedContact = enrichedData.person || enrichedData;

      // Save to database
      const saveResponse = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: contact.first_name,
          lastName: contact.last_name,
          name: `${contact.first_name} ${contact.last_name}`,
          email:
            enrichedContact.email ||
            enrichedContact.personal_email ||
            contact.email,
          domain:
            contact.organization?.primary_domain ||
            contact.account?.domain ||
            contact.organization_name.toLowerCase().replace(/[^a-z0-9]/g, "") +
              ".com",
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        console.error("Save response error:", errorData);
        throw new Error("Failed to save contact");
      }

      // Update the contact in the list
      setSearchResults((prev) =>
        prev.map((c) =>
          c.id === contact.id
            ? {
                ...c,
                email:
                  enrichedContact.email ||
                  enrichedContact.personal_email ||
                  c.email,
                enriched: true,
              }
            : c
        )
      );

      toast.success("Contact enriched and saved successfully");
    } catch (error) {
      console.error("Enrichment error:", error);
      toast.error("Failed to enrich contact");
    } finally {
      setIsEnriching((prev) => ({ ...prev, [contact.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Search Company</CardTitle>
          <CardDescription>
            Enter a company domain to find decision makers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex flex-col flex-1 gap-2">
                <Label htmlFor="domain">Company Domain</Label>
                <Input
                  id="domain"
                  placeholder="example.com"
                  {...register("domain", { required: true })}
                />
              </div>
              <Button type="submit" className="self-end" disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Found {searchResults.length} decision makers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {contact.first_name} {contact.last_name}
                        </div>
                        {contact.linkedin_url && (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:underline"
                          >
                            LinkedIn Profile
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="text-xs font-normal" variant="outline">
                        {contact.title}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {contact.organization_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.email ? (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {contact.email}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Not enriched
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.enriched ? (
                        <Button variant="ghost" disabled>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => enrichContact(contact)}
                          disabled={isEnriching[contact.id]}
                        >
                          {isEnriching[contact.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
