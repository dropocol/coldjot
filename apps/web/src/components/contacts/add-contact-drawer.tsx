"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Contact } from "@prisma/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  FileSpreadsheet,
  Plus,
  AlertCircle,
  X,
  Upload,
  FileUp,
} from "lucide-react";
import Papa from "papaparse";

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  linkedinUrl?: string;
};

interface AddContactModalProps {
  onClose: () => void;
  onAdd: (contact: Contact) => void;
}

interface ContactForm {
  firstName: string;
  lastName: string;
  email: string;
}

interface ParsedContacts {
  contacts: ContactForm[];
  file: File;
}

export default function AddContactModal({
  onClose,
  onAdd,
}: AddContactModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>("manual");
  const [parsedContacts, setParsedContacts] = useState<ParsedContacts | null>(
    null
  );
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMethods = [
    {
      id: "manual",
      name: "Add Manually",
      icon: Plus,
      description: "Create contacts one by one",
    },
    {
      id: "csv",
      name: "Import CSV",
      icon: FileSpreadsheet,
      description: "Upload your contacts from a CSV file (max 1,000 contacts)",
    },
  ];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const contacts = results.data
            .slice(0, 1000)
            .map((row: any) => ({
              firstName: row["First Name"] || row.firstName || "",
              lastName: row["Last Name"] || row.lastName || "",
              email: row.Email || row.email || "",
            }))
            .filter(
              (contact) =>
                contact.email && contact.firstName && contact.lastName
            );

          if (contacts.length === 0) {
            toast.error("No valid contacts found in CSV");
            return;
          }

          setParsedContacts({ contacts, file });
          setUploadSuccess(false);
        },
        error: (error) => {
          console.error("CSV parsing error:", error);
          toast.error("Failed to parse CSV file");
        },
      });
    } catch (error) {
      console.error("File reading error:", error);
      toast.error("Failed to read CSV file");
    }
  };

  const handleFileDelete = () => {
    setParsedContacts(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!parsedContacts) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/contacts/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedContacts.contacts),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Failed to import contacts");
      } else {
        toast.success(
          `Successfully imported ${data.imported} contacts${
            data.skipped ? ` (${data.skipped} skipped)` : ""
          }`
        );
        setUploadSuccess(true);
        setParsedContacts(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onClose();
      }
    } catch (error) {
      console.error("Failed to import contacts:", error);
      toast.error("Failed to import contacts");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to add contact");
        return;
      }

      const contact = await response.json();
      toast.success("Contact added successfully");
      onAdd(contact);
      onClose();
    } catch (error) {
      toast.error("Failed to add contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[800px] sm:max-w-[800px] h-[100dvh] p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Add New Contact</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {/* <Alert className="mb-6 flex items-center gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
              <AlertDescription className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                CSV file can contain up to 1,000 contacts. Any additional
                contacts will be ignored to prevent system abuse.
              </AlertDescription>
            </Alert> */}

            {uploadSuccess && (
              <Alert className="mb-6 flex items-center gap-2 bg-green-500/10 border-green-500/20 text-green-700">
                <AlertDescription className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Contacts have been successfully imported!
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Choose Import Method</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {importMethods.map((method) => (
                      <Card
                        key={method.id}
                        className={`p-4 flex items-center gap-2 shadow-none hover:bg-accent cursor-pointer transition-colors ${
                          selectedMethod === method.id ? "border-gray-400" : ""
                        }`}
                        onClick={() => setSelectedMethod(method.id)}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="p-2 rounded-full h-9 w-9 bg-primary/10">
                            <method.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium">{method.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {method.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {selectedMethod === "manual" && (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          {...register("firstName", {
                            required: "First name is required",
                          })}
                          placeholder="Enter first name"
                        />
                        {errors.firstName && (
                          <p className="text-sm text-destructive">
                            {errors.firstName.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          {...register("lastName", {
                            required: "Last name is required",
                          })}
                          placeholder="Enter last name"
                        />
                        {errors.lastName && (
                          <p className="text-sm text-destructive">
                            {errors.lastName.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        {...register("email", {
                          required: "Email is required",
                          pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: "Invalid email address",
                          },
                        })}
                        placeholder="Enter email address"
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">
                          {errors.email.message}
                        </p>
                      )}
                    </div>
                  </form>
                )}

                {selectedMethod === "csv" && (
                  <div className="space-y-4">
                    <Card className="p-8 border-dashed shadow-none border-slate-300">
                      <div className="flex flex-col items-center justify-center gap-4">
                        <div className="p-4 rounded-full bg-primary/10">
                          <FileUp className="h-8 w-8 text-primary" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-medium">Upload CSV File</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your CSV should include columns for: First Name,
                            Last Name, and Email Address
                          </p>
                        </div>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          onChange={handleFileSelect}
                          className="cursor-pointer max-w-sm"
                          disabled={isSubmitting}
                        />
                        {parsedContacts && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileSpreadsheet className="h-4 w-4" />
                            {parsedContacts.file.name} (
                            {parsedContacts.contacts.length} contacts)
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleFileDelete}
                              className="h-6 w-6"
                              disabled={isSubmitting}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t mt-auto">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {selectedMethod === "manual" ? (
                <Button
                  onClick={handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Contact"
                  )}
                </Button>
              ) : (
                parsedContacts && (
                  <Button onClick={handleUpload} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Contacts
                      </>
                    )}
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
