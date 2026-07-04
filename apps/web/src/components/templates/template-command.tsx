"use client";

import { useState } from "react";

import { Button } from "@coldjot/ui/components/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@coldjot/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@coldjot/ui/components/popover";
import { FileText } from "lucide-react";
import { useTemplates } from "@/hooks/queries/use-templates";

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface TemplateCommandProps {
  onSelect: (template: Template) => void;
}

export function TemplateCommand({ onSelect }: TemplateCommandProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useTemplates({ page: 1, limit: 100 });
  const templates = (data?.templates ?? []) as Template[];

  const filteredTemplates =
    search === ""
      ? templates
      : templates.filter((template) => {
          const searchLower = search.toLowerCase();
          return (
            template.name.toLowerCase().includes(searchLower) ||
            template.subject.toLowerCase().includes(searchLower)
          );
        });

  //  Always set modal={true} to to allow scrolling the parent page and popover to work
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Templates
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        sideOffset={5}
        side="top"
      >
        <Command>
          <CommandInput
            placeholder="Search templates..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[300px] overflow-auto">
            <CommandEmpty>
              {isLoading ? "Loading templates..." : "No templates found"}
            </CommandEmpty>
            <CommandGroup>
              {filteredTemplates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.name}
                  onSelect={() => {
                    onSelect(template);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {template.subject}
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
