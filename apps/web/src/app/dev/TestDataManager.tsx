"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import testData from "./data.json";

interface Contact {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  company: string;
  department: string;
  title: string;
  id?: string; // Added for when we get back the created contact
}

// Function to generate random contacts with company info
function generateContacts(count: number): Contact[] {
  const { firstNames, lastNames, titles, companies, departments, domains } =
    testData.contactGenerator;
  const contacts: Contact[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const department =
      departments[Math.floor(Math.random() * departments.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;

    contacts.push({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      company,
      department,
      title,
    });
  }

  return contacts;
}

// Function to randomly assign contacts to lists based on percentage
function assignContactsToList(
  contacts: Contact[],
  percentage: number
): string[] {
  const count = Math.floor((contacts.length * percentage) / 100);
  const shuffled = [...contacts].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map((contact) => contact.id!);
}

interface TestDataManagerProps {
  userId: string;
}

export default function TestDataManager({ userId }: TestDataManagerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const addTestData = async () => {
    setIsLoading(true);
    try {
      // 1. Add contacts
      const contacts = generateContacts(testData.contactGenerator.count);
      const createdContacts = await Promise.all(
        contacts.map(async (contact) => {
          const response = await fetch("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(contact),
          });
          return response.json();
        })
      );

      // 2. Add email lists with contact assignments
      const createdLists = await Promise.all(
        testData.emailLists.map(async (list) => {
          // Assign contacts based on the percentage
          const contactIds = assignContactsToList(
            createdContacts,
            list.contactsPercentage
          );

          const response = await fetch("/api/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: list.name,
              description: list.description,
              tags: list.tags,
              userId,
              contacts: contactIds, // Send the contact IDs to connect
            }),
          });
          return response.json();
        })
      );

      // 3. Add templates
      const createdTemplates = await Promise.all(
        testData.templates.map(async (template) => {
          const response = await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...template,
              userId,
            }),
          });
          return response.json();
        })
      );

      // 4. Add sequences with steps
      const createdSequences = await Promise.all(
        testData.sequences.map(async (sequence) => {
          const response = await fetch("/api/sequences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...sequence,
              userId,
            }),
          });
          return response.json();
        })
      );

      // 5. Add business hours
      await fetch("/api/business-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...testData.businessHours,
          userId,
        }),
      });

      toast.success("Test data added successfully");
    } catch (error) {
      console.error("Error adding test data:", error);
      toast.error("Failed to add test data");
    } finally {
      setIsLoading(false);
    }
  };

  const clearTestData = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/dev/clear-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      toast.success("Test data cleared successfully");
    } catch (error) {
      console.error("Error clearing test data:", error);
      toast.error("Failed to clear test data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Data Management</CardTitle>
          <CardDescription>
            Add or remove test data for development purposes. This will create:
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>{testData.contactGenerator.count} sample contacts</li>
              <li>{testData.templates.length} email templates</li>
              <li>{testData.emailLists.length} email lists</li>
              <li>{testData.sequences.length} sequences</li>
              <li>Business hours configuration</li>
              <li>Sample mailboxes and aliases</li>
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={addTestData}
              disabled={isLoading}
              className="w-[200px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Data...
                </>
              ) : (
                "Add Test Data"
              )}
            </Button>
            <Button
              onClick={clearTestData}
              disabled={isLoading}
              variant="destructive"
              className="w-[200px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing Data...
                </>
              ) : (
                "Clear All Test Data"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
