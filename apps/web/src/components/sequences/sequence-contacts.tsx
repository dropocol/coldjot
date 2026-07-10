"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@coldjot/ui/components/button";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import { ContactSearch } from "@/components/search/contact-search-dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coldjot/ui/components/table";
import { toast } from "sonner";
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
  RotateCcw,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { ListSelector } from "@/components/lists/list-selector";
import { formatDistanceToNow, format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coldjot/ui/components/tooltip";
import type { Contact } from "@coldjot/types";
import { SequenceContactStatusEnum } from "@coldjot/types";
import type { SequenceContactStatusType } from "@coldjot/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";
import { PaginationControls } from "@/components/pagination";
import { useSequence } from "@/lib/sequence-context";
import {
  useSequenceContacts,
  useRemovedSequenceContacts,
  useAddContactToSequence,
  useRemoveContactFromSequence,
  useRestoreSequenceContacts,
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
  removedAt: Date | null;
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
  const [removedSelected, setRemovedSelected] = useState<string[]>([]);
  const { updateReadinessField } = useSequence();

  // "active" (default) vs "removed" view, driven by ?view=removed in the URL.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isRemovedView = searchParams.get("view") === "removed";

  const setView = (view: "active" | "removed") => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "removed") {
      params.set("view", "removed");
    } else {
      params.delete("view");
    }
    // reset to page 1 when switching views
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  // Poll for updates while the sequence is active; otherwise just fetch once.
  const { data, isLoading } = useSequenceContacts(
    sequenceId,
    { page, limit },
    { refetchInterval: isActive ? 30_000 : false }
  );
  const contacts = (data?.contacts as ExtendedSequenceContact[] | undefined) ?? [];
  const totalSteps = data?.totalSteps ?? 0;
  const total = data?.total ?? 0;

  // Removed contacts (only fetched in the removed view).
  const { data: removedData, isLoading: removedLoading } = useRemovedSequenceContacts(sequenceId, {
    page,
    limit,
  });
  const removedContacts = (removedData?.contacts as ExtendedSequenceContact[] | undefined) ?? [];
  const removedTotal = removedData?.total ?? 0;

  const addMutation = useAddContactToSequence(sequenceId);
  const removeMutation = useRemoveContactFromSequence(sequenceId);
  const restoreMutation = useRestoreSequenceContacts(sequenceId);
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

  const handleStatusUpdate = async (contactId: string, status: SequenceContactStatusType) => {
    try {
      await statusMutation.mutateAsync({ contactId, status });
      toast.success("Contact status updated successfully");
    } catch (_error) {
      toast.error("Failed to update contact status");
    }
  };

  // Restore supports a single id or the whole selection.
  const handleRestore = async (contactIds: string[]) => {
    if (contactIds.length === 0) return;
    try {
      const res = await restoreMutation.mutateAsync(contactIds);
      setRemovedSelected((prev) => prev.filter((id) => !contactIds.includes(id)));
      toast.success(`Restored ${res.restored} contact${res.restored === 1 ? "" : "s"}`);
    } catch (_error) {
      toast.error("Failed to restore contact(s)");
    }
  };

  const allRemovedSelected =
    removedContacts.length > 0 &&
    removedContacts.every((c) => removedSelected.includes(c.contactId));

  const toggleAllRemoved = () => {
    if (allRemovedSelected) {
      setRemovedSelected((prev) =>
        prev.filter((id) => !removedContacts.some((c) => c.contactId === id))
      );
    } else {
      setRemovedSelected((prev) =>
        Array.from(new Set([...prev, ...removedContacts.map((c) => c.contactId)]))
      );
    }
  };

  const toggleOneRemoved = (contactId: string) => {
    setRemovedSelected((prev) =>
      prev.includes(contactId) ? prev.filter((x) => x !== contactId) : [...prev, contactId]
    );
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
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>Not Started</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isRemovedView ? (
        <RemovedContactsView
          contacts={removedContacts}
          isLoading={removedLoading}
          isRestoring={restoreMutation.isPending}
          selected={removedSelected}
          allSelected={allRemovedSelected}
          onToggleAll={toggleAllRemoved}
          onToggleOne={toggleOneRemoved}
          onRestore={handleRestore}
          onBack={() => setView("active")}
          currentPage={page}
          pageSize={limit}
          totalItems={removedTotal}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : (
        <ActiveContactsView
          selectedContact={selectedContact}
          setSelectedContact={setSelectedContact}
          handleAddContact={handleAddContact}
          isMutating={isMutating}
          sequenceId={sequenceId}
          isLoading={isLoading}
          contacts={contacts}
          totalSteps={totalSteps}
          isActive={isActive}
          getStatusDetails={getStatusDetails}
          onViewRemoved={() => setView("removed")}
          handleSendNow={handleSendNow}
          handleStatusUpdate={handleStatusUpdate}
          handleRemoveContact={handleRemoveContact}
          currentPage={page}
          pageSize={limit}
          totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

// ── Removed contacts view ───────────────────────────────────────────────────

interface RemovedContactsViewProps {
  contacts: ExtendedSequenceContact[];
  isLoading: boolean;
  isRestoring: boolean;
  selected: string[];
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (contactId: string) => void;
  onRestore: (contactIds: string[]) => void;
  onBack: () => void;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function RemovedContactsView({
  contacts,
  isLoading,
  isRestoring,
  selected,
  allSelected,
  onToggleAll,
  onToggleOne,
  onRestore,
  onBack,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: RemovedContactsViewProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Active
          </Button>
          <h2 className="text-lg font-semibold tracking-tight">Removed Contacts</h2>
        </div>
        {selected.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRestore(selected)}
            disabled={isRestoring}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Restore {selected.length}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {selected.length > 0
          ? `${selected.length} selected`
          : "Removed contacts can be restored to the sequence."}
      </div>

      {totalItems === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center border rounded-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Trash2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No removed contacts</h3>
          <p className="text-sm text-muted-foreground">
            Contacts you remove from this sequence will appear here.
          </p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={onToggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Removed</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(c.contactId)}
                        onCheckedChange={() => onToggleOne(c.contactId)}
                        aria-label={`Select ${c.contact.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.contact.name}</div>
                      <div className="text-sm text-muted-foreground">{c.contact.email}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.removedAt ? format(new Date(c.removedAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRestore([c.contactId])}
                        disabled={isRestoring}
                      >
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        currentPage={currentPage}
        totalPages={Math.ceil(totalItems / pageSize)}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
}

// ── Active contacts view (the original UI, extracted) ───────────────────────

interface ActiveContactsViewProps {
  selectedContact: Contact | null;
  setSelectedContact: (c: Contact | null) => void;
  handleAddContact: (c: Contact) => void;
  isMutating: boolean;
  sequenceId: string;
  isLoading: boolean;
  contacts: ExtendedSequenceContact[];
  totalSteps: number;
  isActive: boolean;
  getStatusDetails: (c: ExtendedSequenceContact) => React.ReactNode;
  onViewRemoved: () => void;
  handleSendNow: (id: string) => void;
  handleStatusUpdate: (id: string, status: SequenceContactStatusType) => void;
  handleRemoveContact: (id: string) => void;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function ActiveContactsView({
  selectedContact,
  setSelectedContact,
  handleAddContact,
  isMutating,
  sequenceId,
  isLoading,
  contacts,
  totalSteps,
  isActive,
  getStatusDetails,
  onViewRemoved,
  handleSendNow,
  handleStatusUpdate,
  handleRemoveContact,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: ActiveContactsViewProps) {
  return (
    <>
      <div className="flex justify-between items-center gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Contacts</h2>
        <div className="flex gap-2">
          <div className="w-[320px]">
            <ContactSearch selectedContact={selectedContact} onSelect={setSelectedContact} />
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
          <Button variant="outline" onClick={onViewRemoved}>
            <Trash2 className="h-4 w-4" />
            Trash
          </Button>
        </div>
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
                          {format(new Date(sequenceContact.startedAt), "MMM d, yyyy")}
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(sequenceContact.startedAt), "h:mm a")}
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
                        {format(new Date(sequenceContact.nextScheduledAt), "MMM d, yyyy")}
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(sequenceContact.nextScheduledAt), "h:mm a")}
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
                            {formatDistanceToNow(new Date(sequenceContact.lastProcessedAt), {
                              addSuffix: true,
                            })}
                          </>
                        ) : (
                          "No activity yet"
                        )}
                      </div>
                      {sequenceContact.completedAt && (
                        <div className="text-xs text-muted-foreground">
                          Completed in{" "}
                          {formatDistanceToNow(new Date(sequenceContact.completedAt), {
                            addSuffix: false,
                          })}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" disabled={isMutating} />}
                      >
                        {isMutating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreVertical className="h-4 w-4" />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSendNow(sequenceContact.id)}>
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
                          onClick={() => handleRemoveContact(sequenceContact.contactId)}
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
        currentPage={currentPage}
        totalPages={Math.ceil(totalItems / pageSize)}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
}
