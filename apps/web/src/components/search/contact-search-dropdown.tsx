"use client";

import { useState, useEffect } from "react";
import { Contact } from "@prisma/client";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@coldjot/ui/lib/utils";
import { Button } from "@coldjot/ui/components/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@coldjot/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@coldjot/ui/components/popover";
import { useContactSearch } from "@/hooks/queries/use-contacts";

interface Props {
  selectedContact: Contact | null;
  onSelect: (contact: Contact | null) => void;
}

export function ContactSearch({ selectedContact, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Only run the search query for 2+ char input (matches previous behavior).
  const searchQuery = inputValue.length >= 2 ? inputValue : "";
  const { data: searchResults, isLoading } = useContactSearch(searchQuery);
  const results = (searchResults ?? []) as Contact[];

  // Set initial value if contact is pre-selected
  useEffect(() => {
    if (selectedContact) {
      setInputValue(`${selectedContact.name} <${selectedContact.email}>`);
      setOpen(false);
    }
  }, [selectedContact]);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex items-center truncate">
              {selectedContact ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{selectedContact.name}</span>
                  <span className="text-muted-foreground truncate">
                    ({selectedContact.email})
                  </span>
                </div>
              ) : (
                "Search contacts..."
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name, email..."
              value={inputValue}
              onValueChange={(value) => {
                setInputValue(value);
                setOpen(true);
              }}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Searching..." : "No contact found"}
              </CommandEmpty>
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      onSelect={() => {
                        onSelect(contact);
                        setOpen(false);
                      }}
                      className="flex flex-col items-start"
                    >
                      <div className="flex w-full items-center gap-2">
                        <Check
                          className={cn(
                            "h-4 w-4",
                            selectedContact?.id === contact.id
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate font-medium">
                            {contact.name}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">
                            {contact.email}
                          </span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedContact && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onSelect(null);
            setInputValue("");
            
          }}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
