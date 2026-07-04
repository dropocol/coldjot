"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@coldjot/ui/components/separator";
import type { SearchResult, SearchResultType } from "@coldjot/types";
import { Input } from "@coldjot/ui/components/input";
import { Button } from "@coldjot/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@coldjot/ui/components/tabs";

import {
  User,
  Building2,
  Loader2,
  Search,
  Mail,
  Edit2,
  Trash2,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import Link from "next/link";
import { toast } from "sonner";
import {
  useContactSearch,
  useDeleteContact,
} from "@/hooks/queries/use-contacts";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState<SearchResultType | "all">("all");

  // react-query backs the search (gated on a non-empty query).
  const activeQuery = searchParams.get("q") || query;
  const { data: contactResults, isLoading } = useContactSearch(activeQuery);
  const deleteContact = useDeleteContact();

  const results: SearchResult[] = (contactResults ?? []).map((contact) => ({
    id: contact.id,
    type: "contact" as const,
    title: `${contact.firstName} ${contact.lastName}`,
    subtitle: contact.email,
    url: `/contacts/${contact.id}`,
  }));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const filteredResults =
    activeTab === "all"
      ? results
      : results.filter((result) => result.type === activeTab);

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Search"
            description="Search across all your contacts and templates."
          />
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              type="search"
              placeholder="Search..."
              className="w-[300px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" variant="outline">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
        <Separator />
      </div>

      <div className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as SearchResultType | "all")
          }
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">
                All Results ({results.length})
              </TabsTrigger>
              <TabsTrigger value="contact">
                Contacts ({results.filter((r) => r.type === "contact").length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !query ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Search className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  Enter a search term to begin
                </p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Search className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Name</TableHead>
                      <TableHead className="w-[15%]">Type</TableHead>
                      <TableHead className="w-[35%]">Details</TableHead>
                      <TableHead className="w-[15%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                      <TableRow key={result.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {result.type === "contact" ? (
                              <User className="h-4 w-4 text-muted-foreground/70" />
                            ) : (
                              <Building2 className="h-4 w-4 text-muted-foreground/70" />
                            )}
                            <Link
                              href={result.url!}
                              className="font-medium hover:underline"
                            >
                              {result.title}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">
                            {result.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {result.subtitle}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {result.type === "contact" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    localStorage.setItem(
                                      "selectedContact",
                                      JSON.stringify({
                                        id: result.id,
                                        name: result.title,
                                        email: result.subtitle,
                                      })
                                    );
                                    router.push("/compose");
                                  }}
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                                <Link href={`/contacts/${result.id}/edit`}>
                                  <Button variant="ghost" size="icon">
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    try {
                                      await deleteContact.mutateAsync(
                                        result.id
                                      );
                                      toast.success(
                                        "Contact deleted successfully"
                                      );
                                    } catch (_error) {
                                      toast.error("Failed to delete contact");
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
