"use client";

import { useState, useEffect } from "react";
import { Template } from "@prisma/client";

import EditTemplateDrawer from "./edit-template-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coldjot/ui/components/table";
import { Button } from "@coldjot/ui/components/button";
import { Edit2, Trash2, FileText, Eye, ScrollText, MoreVertical, Copy } from "lucide-react";
import PreviewTemplateDrawer from "./preview-template-drawer";
import DeleteTemplateDialog from "./delete-template-dialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import { PaginationControls } from "@/components/pagination";
import { useQueryClient } from "@tanstack/react-query";
import { useTemplates, useCreateTemplate } from "@/hooks/queries/use-templates";
import { qk } from "@/lib/query/keys";

interface TemplateListProps {
  searchQuery?: string;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
  initialTemplates: Template[];
  onAddTemplate?: () => void;
  onSelectedTemplatesChange?: (templateIds: string[]) => void;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function TemplateList({
  searchQuery = "",
  onSearchStart,
  onSearchEnd,
  initialTemplates,
  onAddTemplate,
  onSelectedTemplatesChange,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
}: TemplateListProps) {
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useTemplates({
    page,
    limit,
    search: searchQuery.length >= 2 ? searchQuery : undefined,
  });
  const createTemplate = useCreateTemplate();

  // Surface the parent's search start/end callbacks while fetching.
  useEffect(() => {
    if (isFetching && onSearchStart) onSearchStart();
    if (!isFetching && onSearchEnd) onSearchEnd();
    // Parent callbacks are treated as stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  // Notify parent component when selected templates change
  useEffect(() => {
    if (onSelectedTemplatesChange) {
      const templateIds = Array.from(selectedTemplates);
      onSelectedTemplatesChange(templateIds);
    }
    // Intentionally only re-runs when the selection changes; the parent callback
    // is treated as stable to avoid notification loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplates]);

  const templates = data?.templates ?? initialTemplates;
  const total = data?.total ?? initialTemplates.length;

  const showLoading = isLoading;
  const showEmptyState = !showLoading && templates.length === 0;

  const handleCheckboxChange = (templateId: string, checked: boolean) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(templateId);
      } else {
        next.delete(templateId);
      }
      return next;
    });
  };

  const handleDuplicate = async (template: Template) => {
    try {
      await createTemplate.mutateAsync({
        name: `${template.name} (Copy)`,
        subject: template.subject,
        content: template.content,
      });
      toast.success("Template duplicated successfully");
    } catch (_error) {
      toast.error("Failed to duplicate template");
    }
  };

  return (
    <div className="space-y-4">
      {showLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="space-y-4 text-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3 w-96 rounded bg-muted" />
            </div>
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <ScrollText className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Create your first template</h3>
          <p className="text-muted-foreground mb-4">
            Start creating email templates to streamline your communication and save time.
          </p>
          <Button onClick={onAddTemplate}>Add Template</Button>
        </div>
      ) : (
        <>
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] pl-3">
                    <Checkbox
                      checked={selectedTemplates.size === templates.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTemplates(new Set(templates.map((t) => t.id)));
                        } else {
                          setSelectedTemplates(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} className="hover:bg-muted/50">
                    <TableCell className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedTemplates.has(template.id)}
                        onCheckedChange={(checked) =>
                          handleCheckboxChange(template.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground/70" />
                        <span className="font-medium">{template.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{template.subject}</TableCell>
                    <TableCell>{new Date(template.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewTemplate(template)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingTemplate(template)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            currentPage={page}
            totalPages={Math.ceil(total / limit)}
            pageSize={limit}
            totalItems={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}

      {previewTemplate && (
        <PreviewTemplateDrawer
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}

      {editingTemplate && (
        <EditTemplateDrawer
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={() => {
            qc.invalidateQueries({ queryKey: qk.templates.all });
            setEditingTemplate(null);
            toast.success("Template updated successfully");
          }}
        />
      )}

      {deletingTemplate && (
        <DeleteTemplateDialog
          template={deletingTemplate}
          onClose={() => setDeletingTemplate(null)}
          onDelete={() => {
            qc.invalidateQueries({ queryKey: qk.templates.all });
            setDeletingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
