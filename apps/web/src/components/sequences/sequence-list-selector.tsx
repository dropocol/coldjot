"use client";

import { useState, useEffect, ReactNode } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { List, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { EmailList as BaseEmailList } from "@coldjot/types";

// Extend the EmailList type to include the _count property
interface EmailList extends BaseEmailList {
  _count?: {
    contacts: number;
  };
}

interface ListResponse {
  lists: EmailList[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

interface SequenceListSelectorProps {
  onSelect: (listId: string) => void;
  excludeIds?: string[];
  trigger: ReactNode;
}

export function SequenceListSelector({
  onSelect,
  excludeIds = [],
  trigger,
}: SequenceListSelectorProps) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<EmailList[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLists = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/lists");
        if (!response.ok) throw new Error("Failed to fetch lists");
        const data: ListResponse = await response.json();

        // Filter out lists that are already in the sequence
        const filteredLists =
          excludeIds.length > 0
            ? data.lists.filter((list) => !excludeIds.includes(list.id))
            : data.lists;

        setLists(filteredLists);
      } catch (error) {
        console.error("Error fetching lists:", error);
        toast.error("Failed to load lists");
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchLists();
    }

    // Only re-run when the popover opens or excludeIds changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(excludeIds)]);

  const handleSelectList = (listId: string) => {
    onSelect(listId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search lists..." />
          <CommandList>
            <CommandEmpty>No lists found</CommandEmpty>
            <CommandGroup>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground">
                    Loading lists...
                  </span>
                </div>
              ) : lists.length === 0 ? (
                <div className="flex items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground">
                    {excludeIds.length > 0
                      ? "All available lists are already added"
                      : "No lists found"}
                  </span>
                </div>
              ) : (
                lists.map((list) => (
                  <CommandItem
                    key={list.id}
                    onSelect={() => handleSelectList(list.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="font-medium">{list.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {list._count?.contacts || 0} contacts
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
