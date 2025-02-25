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
import testData from "./testData.json";

// Function to generate random contacts
function generateContacts(count: number) {
  const { firstNames, lastNames, titles } = testData.contactGenerator;
  const contacts: any = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;

    contacts.push({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
    });
  }

  return contacts;
}

interface TestDataManagerProps {
  userId: string;
}

export default function TestDataManager({ userId }: TestDataManagerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const addTestData = async () => {
    setIsLoading(true);
    try {
      // Generate and add contacts with company associations
      const contacts = generateContacts(testData.contactGenerator.count);
      await Promise.all(
        contacts.map(async (contact, index) => {
          const response = await fetch("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...contact,
            }),
          });
          return response.json();
        })
      );

      // Add templates
      await Promise.all(
        testData.templates.map(async (template) => {
          const response = await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(template),
          });
          return response.json();
        })
      );

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
      await Promise.all([
        fetch("/api/dev/clear-data", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      ]);
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
            Add or remove test data for development purposes.
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
