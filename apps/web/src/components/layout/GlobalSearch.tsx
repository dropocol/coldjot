"use client";

import * as React from "react";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  User,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { SearchResult, SearchResultType } from "@coldjot/types";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useContactSearch } from "@/hooks/queries/use-contacts";

export function GlobalSearch({ isCollapsed }: { isCollapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // Contact search backed by react-query (gated on non-empty query).
  const { data: contactResults, isLoading } = useContactSearch(query);
  const contacts = contactResults ?? [];

  const mounted = React.useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) {
      return;
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Build unified search results from the contacts query.
  const results: SearchResult[] = contacts.map((contact) => ({
    id: contact.id,
    type: "contact" as const,
    title: `${contact.firstName} ${contact.lastName}`,
    subtitle: contact.email,
    url: `/contacts/${contact.id}`,
  }));

  const _groupedResults = useMemo(() => {
    const grouped = results.reduce(
      (acc, item) => {
        const group = acc[item.type] || [];
        group.push(item);
        acc[item.type] = group;
        return acc;
      },
      {} as Record<SearchResultType, SearchResult[]>
    );
    return grouped;
  }, [results]);

  const viewAllItem: SearchResult = {
    id: "view-all",
    type: "action",
    title: "View all results",
    subtitle: ``,
    url: `/search?q=${encodeURIComponent(query)}`,
  };

  const displayedResults =
    results.length > 0 ? [...results.slice(0, 2), viewAllItem] : [];

  const handleViewAll = () => {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <Button
        variant="outline"
        className={cn(
          "relative h-9 justify-start text-sm text-muted-foreground transition-colors",
          isCollapsed
            ? "w-9 px-0 justify-center"
            : "w-full sm:pr-12 md:max-w-40 lg:max-w-80 hover:border-primary/50"
        )}
        onClick={() => setOpen(true)}
      >
        <Search className={cn("h-4 w-4", !isCollapsed && "mr-0")} />
        {!isCollapsed && (
          <>
            <span className="hidden lg:inline-flex">Search...</span>
            <span className="inline-flex lg:hidden">Search...</span>
            <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </>
        )}
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <VisuallyHidden.Root>
          <DialogTitle>Search</DialogTitle>
        </VisuallyHidden.Root>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0"
          filter={(value, search) => {
            if (value === "view-all") return 1;
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder="Search contacts & templates..."
            value={query}
            onValueChange={setQuery}
            className="border-none focus:ring-0"
          />
          <CommandList className="max-h-[500px] overflow-y-auto py-2 pb-0">
            {query.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-sm">
                Type to start searching...
              </CommandEmpty>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-sm">
                No results found.
              </CommandEmpty>
            ) : (
              <>
                {displayedResults.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={
                      item.type === "action"
                        ? "view-all"
                        : `${item.title} ${item.subtitle}`
                    }
                    onSelect={() => {
                      if (item.type === "action") {
                        handleViewAll();
                      } else {
                        router.push(item.url!);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer transition-colors",
                      item.type === "action"
                        ? "justify-center text-sm hover:text-primary border-t mt-2 pt-4 mx-0 rounded-none hover:bg-transparent"
                        : "hover:bg-primary/5"
                    )}
                  >
                    {item.type === "contact" ? (
                      <User className="h-4 w-4 text-muted-foreground/70" />
                    ) : null}
                    <div className="flex flex-col flex-1 min-w-0">
                      {item.type === "action" ? (
                        <span className="pl-2 flex items-center gap-2">
                          <span className="font-medium truncate">
                            {item.title}
                          </span>
                        </span>
                      ) : item.subtitle ? (
                        <>
                          <span className="font-medium truncate">
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {item.type === "action" ? (
                      <ArrowRight className="ml-2 h-4 w-4" />
                    ) : (
                      <kbd className="ml-auto text-xs text-muted-foreground/50">
                        ↵
                      </kbd>
                    )}
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
