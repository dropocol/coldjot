"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@coldjot/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@coldjot/ui/components/popover";
import { List, Users } from "lucide-react";
import { toast } from "sonner";
import { useLists } from "@/hooks/queries/use-lists";
import { useAddListContactsToSequence } from "@/hooks/queries/use-sequence-contacts";

interface EmailList {
  id: string;
  name: string;
  contacts: { id: string }[];
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

  const { data } = useLists({ page: 1, limit: 100 });
  const lists = (data?.lists ?? []) as EmailList[];
  const addListContacts = useAddListContactsToSequence(sequenceId);

  const handleSelectList = async (list: EmailList) => {
    try {
      await addListContacts.mutateAsync([list.id]);
      toast.success(`Added ${list.contacts.length} contacts from ${list.name}`);
      setOpen(false);
      onListSelected();
    } catch (_error) {
      toast.error("Failed to add contacts from list");
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
                  disabled={addListContacts.isPending}
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
