"use client";

import { useState, ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@coldjot/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@coldjot/ui/components/popover";
import { Users } from "lucide-react";
import { EmailList as BaseEmailList } from "@coldjot/types";
import { useLists } from "@/hooks/queries/use-lists";

// Extend the EmailList type to include the _count property
interface EmailList extends BaseEmailList {
  _count?: {
    contacts: number;
  };
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

  const { data, isLoading } = useLists({ page: 1, limit: 100 });
  const allLists = (data?.lists ?? []) as EmailList[];
  // Filter out lists that are already attached to the sequence.
  const lists =
    excludeIds.length > 0
      ? allLists.filter((list) => !excludeIds.includes(list.id))
      : allLists;

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
