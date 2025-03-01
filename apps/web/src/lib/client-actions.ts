"use client";

import { SequenceReadinessMetadata } from "./sequence-utils";

/**
 * Client-side actions for updating sequence state
 * These functions should be used in components to update the local state
 * without requiring a full page refresh
 */

/**
 * Adds a contact to a sequence and updates the local state
 */
export async function addContactToSequence(
  sequenceId: string,
  contactId: string,
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void
) {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contactId }),
    });

    if (!response.ok) {
      throw new Error("Failed to add contact");
    }

    // Update local state
    updateReadinessField("hasContacts", true);

    return await response.json();
  } catch (error) {
    console.error("Error adding contact:", error);
    throw error;
  }
}

/**
 * Adds a step to a sequence and updates the local state
 */
export async function addStepToSequence(
  sequenceId: string,
  stepData: any,
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void
) {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stepData),
    });

    if (!response.ok) {
      throw new Error("Failed to add step");
    }

    // Update local state
    updateReadinessField("hasSteps", true);

    return await response.json();
  } catch (error) {
    console.error("Error adding step:", error);
    throw error;
  }
}

/**
 * Updates business hours for a sequence and updates the local state
 */
export async function updateBusinessHours(
  sequenceId: string,
  businessHoursData: any,
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void
) {
  try {
    const response = await fetch(
      `/api/sequences/${sequenceId}/business-hours`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(businessHoursData),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update business hours");
    }

    // Update local state
    updateReadinessField("hasBusinessHours", true);

    return await response.json();
  } catch (error) {
    console.error("Error updating business hours:", error);
    throw error;
  }
}

/**
 * Attaches a mailbox to a sequence and updates the local state
 */
export async function attachMailbox(
  sequenceId: string,
  mailboxData: { mailboxId: string; aliasId?: string | null },
  updateReadinessField: (
    field: keyof SequenceReadinessMetadata,
    value: boolean
  ) => void
) {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mailboxData),
    });

    if (!response.ok) {
      throw new Error("Failed to attach mailbox");
    }

    // Update local state
    updateReadinessField("hasMailbox", true);

    return await response.json();
  } catch (error) {
    console.error("Error attaching mailbox:", error);
    throw error;
  }
}

/**
 * Updates sequence settings (testMode, disableSending, etc.) and updates the local state
 */
export async function updateSequenceSettings(
  sequenceId: string,
  settingsData: {
    testMode?: boolean;
    disableSending?: boolean;
    testEmails?: string[];
  },
  updateSequence: (newData: any) => void
) {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settingsData),
    });

    if (!response.ok) {
      throw new Error("Failed to update sequence settings");
    }

    // Update local state in the sequence context
    updateSequence(settingsData);

    return await response.json();
  } catch (error) {
    console.error("Error updating sequence settings:", error);
    throw error;
  }
}
