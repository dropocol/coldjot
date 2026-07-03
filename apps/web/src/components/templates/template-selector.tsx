"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/templates");
        if (!response.ok) throw new Error("Failed to fetch templates");
        const data = await response.json();
        setTemplates(data);
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <Select onValueChange={handleSelect}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select a template" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {template.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
