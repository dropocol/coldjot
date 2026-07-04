"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { ContactSearch } from "@/components/search/contact-search-dropdown";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coldjot/ui/components/table";
import { toast } from "react-hot-toast";
import {
  Loader2,
  UserPlus,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  MoreVertical,
  Send,
  Trash,
  CheckCheck,
  MessageSquare,
} from "lucide-react";
import { ListSelector } from "@/components/lists/list-selector";
import { formatDistanceToNow, format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@coldjot/ui/components/tooltip";
import type { Contact } from "@coldjot/types";
import { SequenceContactStatusEnum } from "@coldjot/types";
import type { SequenceContactStatusType } from "@coldjot/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@coldjot/ui/components/dropdown-menu";
import { PaginationControls } from "@/components/pagination";
import { useSequence } from "@/lib/sequence-context";
import {
  useSequenceContacts,
  useAddContactToSequence,
  useRemoveContactFromSequence,
  useSendContactStepNow,
  useUpdateContactStatus,
} from "@/hooks/queries/use-sequence-contacts";

// Add extended SequenceContact type with all required properties
interface ExtendedSequenceContact {
  id: string;
  sequenceId: string;
  contactId: string;
  contact: Contact;
  status: SequenceContactStatusType;
  currentStep: number;
  nextScheduledAt: Date | null;
  completed: boolean;
  startedAt: Date;
  lastProcessedAt: Date | null;
  completedAt: Date | null;
  threadId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SequenceContactsProps {
  sequenceId: string;
  isActive: boolean;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function SequenceContacts({
  sequenceId,
  isActive,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
}: SequenceContactsProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const { updateReadinessField } = useSequence();

  // Poll for updates while the sequence is active; otherwise just fetch once.
  const { data, isLoading } = useSequenceContacts(
    sequenceId,
    { page, limit },
    { refetchInterval: isActive ? 30_000 : false }
  );
  const contacts =
    (data?.contacts as ExtendedSequenceContact[] | undefined) ?? [];
  const totalSteps = data?.totalSteps ?? 0;
  const total = data?.total ?? 0;

  const addMutation = useAddContactToSequence(sequenceId);
  const removeMutation = useRemoveContactFromSequence(sequenceId);
  const sendNowMutation = useSendContactStepNow(sequenceId);
  const statusMutation = useUpdateContactStatus(sequenceId);
  // Any contact mutation counts as "loading" for the button/spinner gates.
  const isMutating =
    addMutation.isPending ||
    removeMutation.isPending ||
    sendNowMutation.isPending ||
    statusMutation.isPending;

  const handleAddContact = async (contact: Contact) => {
    try {
      await addMutation.mutateAsync(contact.id);
      updateReadinessField("hasContacts", true);
      setSelectedContact(null);
      toast.success("Contact added to sequence");
    } catch (_error) {
      toast.error("Failed to add contact");
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await removeMutation.mutateAsync(contactId);
      toast.success("Contact removed from sequence");
    } catch (_error) {
      toast.error("Failed to remove contact");
    }
  };

  const handleSendNow = async (contactId: string) => {
    try {
      await sendNowMutation.mutateAsync({ contactId });
      toast.success("Contact scheduled for immediate sending");
    } catch (_error) {
      toast.error("Failed to schedule immediate sending");
    }
  };

  const handleStatusUpdate = async (
    contactId: string,
    status: SequenceContactStatusType
  ) => {
    try {
      await statusMutation.mutateAsync({ contactId, status });
      toast.success("Contact status updated successfully");
    } catch (_error) {
      toast.error("Failed to update contact status");
    }
  };

  const getStatusDetails = (contact: ExtendedSequenceContact) => {
    if (contact.status === SequenceContactStatusEnum.REPLIED) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <MessageSquare className="w-4 h-4" />
          <span>Replied</span>
        </div>
      );
    }

    if (
      contact.status === SequenceContactStatusEnum.BOUNCED ||
      contact.status === SequenceContactStatusEnum.ERROR
    ) {
      return (
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>Failed</span>
        </div>
      );
    }

    if (contact.completed) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          <span>Completed</span>
        </div>
      );
    }

    if (
      contact.status === SequenceContactStatusEnum.ACTIVE ||
      contact.status === SequenceContactStatusEnum.SCHEDULED ||
      contact.status === SequenceContactStatusEnum.IN_PROGRESS
    ) {
      return (
        <div className="flex items-center gap-2 text-yellow-600">
          <PlayCircle className="w-4 h-4" />
          <span>In Progress</span>
        </div>
      );
    }

    if (contact.status === SequenceContactStatusEnum.PAUSED) {
      return (
        <div className="flex items-center gap-2 text-orange-600">
          <Clock className="w-4 h-4" />
          <span>Paused</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-gray-600">
        <Clock className="w-4 h-4" />
        <span>Not Started</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ContactSearch
            selectedContact={selectedContact}
            onSelect={setSelectedContact}
          />
        </div>
        <Button
          onClick={() => selectedContact && handleAddContact(selectedContact)}
          disabled={!selectedContact || isMutating}
        >
          {isMutating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4 mr-2" />
          )}
          Add Contact
        </Button>
        {/* ListSelector adds contacts via its own flow; mutations invalidate
            this query, so no explicit callback is needed. */}
        <ListSelector sequenceId={sequenceId} onListSelected={() => undefined} />
      </div>

      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Run Time</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : contacts.length > 0 ? (
              contacts.map((sequenceContact) => (
                <TableRow key={sequenceContact.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {sequenceContact.contact.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {sequenceContact.contact.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium">
                              Step {sequenceContact.currentStep} of {totalSteps}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {sequenceContact.nextScheduledAt
                            ? `Next step scheduled for ${format(
                                new Date(sequenceContact.nextScheduledAt),
                                "MMM d, yyyy 'at' h:mm a"
                              )}`
                            : "No next step scheduled"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>{getStatusDetails(sequenceContact)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {sequenceContact.startedAt ? (
                        <>
                          {format(
                            new Date(sequenceContact.startedAt),
                            "MMM d, yyyy"
                          )}
                          <div className="text-xs text-muted-foreground">
                            {format(
                              new Date(sequenceContact.startedAt),
                              "h:mm a"
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {sequenceContact.nextScheduledAt ? (
                      <div className="text-sm">
                        {format(
                          new Date(sequenceContact.nextScheduledAt),
                          "MMM d, yyyy"
                        )}
                        <div className="text-xs text-muted-foreground">
                          {format(
                            new Date(sequenceContact.nextScheduledAt),
                            "h:mm a"
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm">
                        {sequenceContact.lastProcessedAt ? (
                          <>
                            Last activity{" "}
                            {formatDistanceToNow(
                              new Date(sequenceContact.lastProcessedAt),
                              {
                                addSuffix: true,
                              }
                            )}
                          </>
                        ) : (
                          "No activity yet"
                        )}
                      </div>
                      {sequenceContact.completedAt && (
                        <div className="text-xs text-muted-foreground">
                          Completed in{" "}
                          {formatDistanceToNow(
                            new Date(sequenceContact.completedAt),
                            {
                              addSuffix: false,
                            }
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isMutating}
                        >
                          {isMutating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleSendNow(sequenceContact.id)}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Send Now
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleStatusUpdate(
                              sequenceContact.id,
                              SequenceContactStatusEnum.COMPLETED
                            )
                          }
                        >
                          <CheckCheck className="h-4 w-4 mr-2" />
                          Mark as Completed
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleStatusUpdate(
                              sequenceContact.id,
                              SequenceContactStatusEnum.REPLIED
                            )
                          }
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Mark as Replied
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleRemoveContact(sequenceContact.contactId)
                          }
                        >
                          <Trash className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="text-muted-foreground">
                    {isActive ? (
                      <>
                        <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
                        Waiting for contact activity...
                      </>
                    ) : (
                      "No contacts added to this sequence yet"
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
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
    </div>
  );
}
