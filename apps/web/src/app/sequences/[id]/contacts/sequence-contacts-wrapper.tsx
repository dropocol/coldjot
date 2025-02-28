"use client";

import { SequenceContacts } from "@/components/sequences/sequence-contacts";
import { usePagination } from "@/hooks/use-pagination";

interface SequenceContactsWrapperProps {
  sequenceId: string;
  isActive: boolean;
}

export function SequenceContactsWrapper({
  sequenceId,
  isActive,
}: SequenceContactsWrapperProps) {
  const { page, limit, onPageChange, onPageSizeChange } = usePagination();

  return (
    <SequenceContacts
      sequenceId={sequenceId}
      isActive={isActive}
      page={page}
      limit={limit}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
}
