"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, SendHorizonal, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { Contact } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Sequence {
  id: string;
  name: string;
  status: string;
  _count: {
    contacts: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  contact: Contact;
}

export function AddToSequenceModal({ open, onClose, contact }: Props) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);

  const fetchSequences = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/sequences");
      if (!response.ok) throw new Error("Failed to fetch sequences");
      const data = await response.json();
      setSequences(data.sequences || []);
    } catch (error) {
      console.error("Error fetching sequences:", error);
      toast.error("Failed to load sequences");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSequences();
    }
  }, [open]);

  const handleAddToSequence = async (sequenceId: string) => {
    setIsAdding(true);
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });

      if (!response.ok) throw new Error("Failed to add contact to sequence");

      toast.success("Contact added to sequence successfully");
      onClose();
    } catch (error) {
      console.error("Error adding contact to sequence:", error);
      toast.error("Failed to add contact to sequence");
    } finally {
      setIsAdding(false);
    }
  };

  const filteredSequences = sequences.filter((sequence) =>
    sequence.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizonal className="h-5 w-5" />
            Add Contact to Sequence
          </DialogTitle>
          <DialogDescription>
            Add {contact.firstName} {contact.lastName} to an email sequence
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sequences..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="relative min-h-[300px] max-h-[400px] overflow-auto rounded-md border">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <SendHorizonal className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No sequences found
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSequences.map((sequence) => (
                  <TableRow
                    key={sequence.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      selectedSequence === sequence.id && "bg-muted"
                    )}
                    onClick={() => setSelectedSequence(sequence.id)}
                  >
                    <TableCell className="font-medium">
                      {sequence.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sequence.status === "active" ? "default" : "secondary"
                        }
                      >
                        {sequence.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{sequence._count.contacts} contacts</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToSequence(sequence.id);
                        }}
                        disabled={isAdding}
                        className="w-full"
                      >
                        {isAdding && selectedSequence === sequence.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
