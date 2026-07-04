"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sequence, type SequenceReadinessMetadata } from "@coldjot/types";
import { qk } from "@/lib/query/keys";
import { useSequenceDetail } from "@/hooks/queries/use-sequences";

/**
 * Sequence data + helpers, backed by react-query.
 *
 * Replaces the old hand-rolled context. `SequenceProvider` seeds the
 * react-query cache with a server-fetched `initialSequence` and exposes the
 * sequence id via React context so descendants can call `useSequence()` with
 * no arguments. `useSequence(sequenceId)` is also available for components
 * rendered outside the provider (e.g. the contacts-page add-to-sequence modal).
 *
 * All mutations are optimistic writes into the `qk.sequences.detail(id)` cache
 * entry (mirroring the old context's local-state behavior). `refreshSequence()`
 * forces a server refetch; `isRefreshing` is reactive via the underlying query.
 */

interface SequenceContextValue {
  sequence: Sequence;
  updateSequence: (newData: Partial<Sequence>) => void;
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void;
  refreshSequence: () => void;
  isRefreshing: boolean;
}

const SequenceIdContext = createContext<string | null>(null);

function useSequenceState(sequenceId: string): SequenceContextValue {
  const qc = useQueryClient();
  const detailKey = qk.sequences.detail(sequenceId);

  // Subscribe to the detail query (seeded by SequenceProvider) so `sequence`
  // and `isRefreshing` stay reactive through refetches + optimistic writes.
  const { data: sequence, isFetching } = useSequenceDetail(sequenceId);

  const updateSequence = (newData: Partial<Sequence>) => {
    qc.setQueryData<Sequence>(detailKey, (old) =>
      old ? { ...old, ...newData } : old
    );
  };

  const updateReadinessField = (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => {
    qc.setQueryData<Sequence>(detailKey, (old) => {
      if (!old) return old;
      const currentMetadata = (old.metadata ?? {}) as Record<string, unknown>;
      const currentReadiness =
        (currentMetadata.readiness as SequenceReadinessMetadata | undefined) ??
        {
          hasSteps: false,
          hasContacts: false,
          hasBusinessHours: false,
          hasMailbox: false,
        };
      return {
        ...old,
        metadata: {
          ...currentMetadata,
          readiness: {
            ...currentReadiness,
            [field]: value,
            lastUpdated: new Date().toISOString(),
          },
        },
      };
    });
  };

  const refreshSequence = () => {
    void qc.refetchQueries({ queryKey: detailKey });
  };

  if (!sequence) {
    throw new Error(
      `useSequence: no cached sequence for id "${sequenceId}". Wrap the tree in <SequenceProvider initialSequence={...}> before rendering.`
    );
  }

  return {
    sequence,
    updateSequence,
    updateReadinessField,
    refreshSequence,
    isRefreshing: isFetching,
  };
}

/**
 * Read the active sequence. Inside a `<SequenceProvider>` tree, call with no
 * arguments. Outside the provider (or to target a specific sequence), pass
 * the id explicitly.
 */
export function useSequence(sequenceId?: string): SequenceContextValue {
  const contextId = useContext(SequenceIdContext);
  const id = sequenceId ?? contextId;
  if (!id) {
    throw new Error(
      "useSequence must be used within a SequenceProvider, or called with an explicit sequenceId."
    );
  }
  return useSequenceState(id);
}

export function SequenceProvider({
  children,
  initialSequence,
}: {
  children: ReactNode;
  initialSequence: Sequence;
}) {
  const id = initialSequence.id;
  const value = useMemo(() => id, [id]);

  return (
    <SequenceIdContext.Provider value={value}>
      {/* useSequenceDetail(id, { initialData }) seeds the react-query cache
          with the server-fetched sequence so first paint is SSR-accurate. */}
      <SequenceDetailHydrator initialSequence={initialSequence} />
      {children}
    </SequenceIdContext.Provider>
  );
}

/** Mounts the detail query with initial data (seeds the cache, no UI). */
function SequenceDetailHydrator({
  initialSequence,
}: {
  initialSequence: Sequence;
}) {
  useSequenceDetail(initialSequence.id, { initialData: initialSequence });
  return null;
}
