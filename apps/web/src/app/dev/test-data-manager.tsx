"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@coldjot/ui/components/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import testData from "./data.json";
import { api } from "@/lib/http/api-client";

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
        contacts.map((contact) => api.post("/api/contacts", contact))
      );

      // 2. Add email lists with contact assignments
      await Promise.all(
        testData.emailLists.map(async (list) => {
          // Assign contacts based on the percentage
          const contactIds = assignContactsToList(
            createdContacts as Contact[],
            list.contactsPercentage
          );

          return api.post("/api/lists", {
            name: list.name,
            description: list.description,
            tags: list.tags,
            userId,
            contacts: contactIds, // Send the contact IDs to connect
          });
        })
      );

      // 3. Add templates
      await Promise.all(
        testData.templates.map((template) =>
          api.post("/api/templates", { ...template, userId })
        )
      );

      // 4. Add sequences with steps
      await Promise.all(
        testData.sequences.map((sequence) =>
          api.post("/api/sequences", { ...sequence, userId })
        )
      );

      // 5. Add business hours
      await api.post("/api/business-hours", {
        ...testData.businessHours,
        userId,
      });

      toast.success("Test data added successfully");
    } catch (_error) {
      toast.error("Failed to add test data");
    } finally {
      setIsLoading(false);
    }
  };

  const clearTestData = async () => {
    setIsLoading(true);
    try {
      await api.delete("/api/dev/clear-data");
      toast.success("Test data cleared successfully");
    } catch (_error) {
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
