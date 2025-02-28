import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BracesIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface Placeholder {
  name: string;
  label: string;
  description: string;
}

export const DEFAULT_PLACEHOLDERS: Placeholder[] = [
  {
    name: "firstName",
    label: "First Name",
    description: "The first name of the email recipient",
  },
  {
    name: "lastName",
    label: "Last Name",
    description: "The last name of the email recipient",
  },
];

interface PlaceholderButtonProps {
  onSelectPlaceholder: (placeholder: string) => void;
  textareaId?: string;
}

export function PlaceholderButton({
  onSelectPlaceholder,
  textareaId,
}: PlaceholderButtonProps) {
  const [open, setOpen] = useState(false);
  const activeElement = useRef<Element | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      if (textareaId) {
        const textarea = document.getElementById(textareaId);
        if (textarea instanceof HTMLTextAreaElement) {
          textarea.focus();
          activeElement.current = textarea;
        }
      } else {
        activeElement.current = document.activeElement;
      }
    }
    setOpen(newOpen);
  };

  const handleSelect = (value: string) => {
    const placeholder = DEFAULT_PLACEHOLDERS.find((p) => p.name === value);
    if (placeholder) {
      const placeholderText = `{{${placeholder.name}}}`;

      if (textareaId) {
        const textarea = document.getElementById(textareaId);
        if (textarea instanceof HTMLTextAreaElement) {
          textarea.focus();
          activeElement.current = textarea;
        }
      }

      onSelectPlaceholder(placeholderText);
      setOpen(false);

      if (activeElement.current instanceof HTMLElement) {
        setTimeout(() => {
          (activeElement.current as HTMLElement).focus();
        }, 0);
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BracesIcon className="h-4 w-4 mr-2" />
          Insert Variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={true}>
          <CommandList>
            <CommandInput placeholder="Search placeholders..." />
            <CommandEmpty>No placeholders found.</CommandEmpty>
            <CommandGroup heading="Available Placeholders">
              {DEFAULT_PLACEHOLDERS.map((placeholder) => (
                <CommandItem
                  key={placeholder.name}
                  value={placeholder.name}
                  onSelect={() => handleSelect(placeholder.name)}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{placeholder.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {placeholder.description}
                    </span>
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
