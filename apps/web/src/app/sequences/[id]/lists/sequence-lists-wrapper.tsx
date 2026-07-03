"use client";

import { SequenceLists } from "@/components/sequences/sequence-lists";

interface SequenceListsWrapperProps {
  sequenceId: string;
}

export function SequenceListsWrapper({
  sequenceId: _sequenceId,
}: SequenceListsWrapperProps) {
  return <SequenceLists />;
}
