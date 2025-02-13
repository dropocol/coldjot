"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { FileText } from "lucide-react";

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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/templates");
        if (!response.ok) throw new Error("Failed to fetch templates");
        const data = await response.json();
        setTemplates(data.templates);
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
