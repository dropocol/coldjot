"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@coldjot/ui/components/card";
import { Button } from "@coldjot/ui/components/button";
import { Input } from "@coldjot/ui/components/input";
import { Label } from "@coldjot/ui/components/label";
import {
  Loader2,
  Search,
  Mail,
  Building2,
  UserPlus,
  CheckCircle,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { Badge } from "@coldjot/ui/components/badge";
import { api } from "@/lib/http/api-client";
import { useCreateContact } from "@/hooks/queries/use-contacts";

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

type ApolloEnriched = {
  email?: string;
  personal_email?: string;
};

interface Props {
  userId: string;
}

export default function ApolloSearchComponent({ userId: _userId }: Props) {
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState<Record<string, boolean>>({});
  const [searchResults, setSearchResults] = useState<ApolloContact[]>([]);
  const { register, handleSubmit } = useForm<FormData>();
  const createContact = useCreateContact();

  const onSubmit = async (data: FormData) => {
    setIsSearching(true);
    try {
      const result = await api.post<{
        people?: ApolloContact[];
        contacts?: ApolloContact[];
      }>("/api/search/apollo/search", {
        domain: data.domain,
        titles: ["ceo", "cto", "founder", "co-founder"],
      });
      setSearchResults([...(result.people || []), ...(result.contacts || [])]);
    } catch (_error) {
      toast.error("Failed to search contacts");
    } finally {
      setIsSearching(false);
    }
  };

  const enrichContact = async (contact: ApolloContact) => {
    setIsEnriching((prev) => ({ ...prev, [contact.id]: true }));
    try {
      const enrichedData = await api.post<{ person?: ApolloEnriched }>(
        "/api/search/apollo/enrich",
        {
          apolloContactId: contact.id,
          domain:
            contact.organization?.primary_domain ||
            contact.account?.domain ||
            contact.organization_name.toLowerCase().replace(/[^a-z0-9]/g, "") +
              ".com",
          firstName: contact.first_name,
          lastName: contact.last_name,
        }
      );
      const enrichedContact = enrichedData.person || (enrichedData as unknown as ApolloEnriched);

      // Save to database
      const email =
        enrichedContact.email ||
        enrichedContact.personal_email ||
        contact.email ||
        "";
      await createContact.mutateAsync({
        firstName: contact.first_name,
        lastName: contact.last_name,
        email,
      });

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
    } catch (_error) {
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
