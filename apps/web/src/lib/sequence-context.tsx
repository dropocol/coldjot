"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { SequenceStatus } from "@coldjot/types";
import { SequenceReadinessMetadata } from "@/lib/sequence-utils";

// Define the shape of our context
interface SequenceContextType {
  sequence: any;
  updateSequence: (newData: any) => void;
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void;
  refreshSequence: () => Promise<void>;
  isRefreshing: boolean;
}

// Create the context with a default value
const SequenceContext = createContext<SequenceContextType | undefined>(
  undefined
);

// Provider component
export function SequenceProvider({
  children,
  initialSequence,
}: {
  children: ReactNode;
  initialSequence: any;
}) {
  const [sequence, setSequence] = useState(initialSequence);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Update sequence when initialSequence changes (e.g., from server)
  useEffect(() => {
    setSequence(initialSequence);
    console.log("initialSequence", initialSequence);
  }, [initialSequence]);

  // Function to update the entire sequence object
  const updateSequence = (newData: any) => {
    setSequence((prev: any) => ({
      ...prev,
      ...newData,
    }));
  };

  // Function to update a specific readiness field
  const updateReadinessField = (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => {
    setSequence((prev: any) => {
      // Create a new metadata object with the updated field
      const currentMetadata = prev.metadata || {};
      const currentReadiness = currentMetadata.readiness || {
        hasSteps: false,
        hasContacts: false,
        hasBusinessHours: false,
        hasMailbox: false,
      };

      const updatedMetadata = {
        ...currentMetadata,
        readiness: {
          ...currentReadiness,
          [field]: value,
          lastUpdated: new Date().toISOString(),
        },
      };

      return {
        ...prev,
        metadata: updatedMetadata,
      };
    });
  };

  // Function to refresh sequence data from the server
  const refreshSequence = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch(`/api/sequences/${sequence.id}`);
      if (response.ok) {
        const data = await response.json();
        setSequence(data);
      }
    } catch (error) {
      console.error("Error refreshing sequence data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <SequenceContext.Provider
      value={{
        sequence,
        updateSequence,
        updateReadinessField,
        refreshSequence,
        isRefreshing,
      }}
    >
      {children}
    </SequenceContext.Provider>
  );
}

// Custom hook to use the sequence context
export function useSequence() {
  const context = useContext(SequenceContext);
  if (context === undefined) {
    throw new Error("useSequence must be used within a SequenceProvider");
  }
  return context;
}
