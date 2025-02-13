"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Contact } from "@prisma/client";

interface EmailList {
  id: string;
  name: string;
  contacts: Contact[];
}

interface ListResponse {
  lists: EmailList[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

interface ListSelectorProps {
  sequenceId: string;
  onListSelected: () => void;
}

export function ListSelector({
  sequenceId,
  onListSelected,
}: ListSelectorProps) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<EmailList[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLists = async () => {
      try {
        const response = await fetch("/api/lists");
        if (!response.ok) throw new Error("Failed to fetch lists");
        const data: ListResponse = await response.json();
        setLists(data.lists);
      } catch (error) {
        console.error("Error fetching lists:", error);
      }
    };

    fetchLists();
  }, []);

  const handleSelectList = async (list: EmailList) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/sequences/${sequenceId}/contacts/list`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listId: list.id }),
        }
      );

      if (!response.ok) throw new Error("Failed to add contacts");

      toast.success(`Added ${list.contacts.length} contacts from ${list.name}`);
      setOpen(false);
      onListSelected();
    } catch (error) {
      toast.error("Failed to add contacts from list");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <List className="h-4 w-4" />
          Add from List
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search lists..." />
          <CommandList>
            <CommandEmpty>No lists found</CommandEmpty>
            <CommandGroup>
              {lists.map((list) => (
                <CommandItem
                  key={list.id}
                  onSelect={() => handleSelectList(list)}
                  disabled={isLoading}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">{list.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {list.contacts.length} contacts
                      </span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
