"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@coldjot/ui/components/select";
import { useTemplates } from "@/hooks/queries/use-templates";

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
  const { data } = useTemplates({ page: 1, limit: 100 });
  const templates = (data?.templates ?? []) as Template[];

  const handleSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <Select onValueChange={(v) => handleSelect(v as string)}>
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
