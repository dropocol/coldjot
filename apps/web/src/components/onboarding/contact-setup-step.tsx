import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileSpreadsheet,
  Plus,
  AlertCircle,
  Loader2,
  X,
  Upload,
  FileUp,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-hot-toast";
import Papa from "papaparse";

interface ContactSetupStepProps {
  onNext: () => void;
  onBack: () => void;
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

export function ContactSetupStep({ onNext, onBack }: ContactSetupStepProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("manual");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<ContactForm>({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [parsedContacts, setParsedContacts] = useState<ParsedContacts | null>(
    null
  );
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

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

    setIsLoading(true);
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
      }
    } catch (error) {
      console.error("Failed to import contacts:", error);
      toast.error("Failed to import contacts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.email || !formData.firstName || !formData.lastName) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const { error, data } = await response.json();

      if (error) {
        toast.error(error);
        return;
      }

      if (!response.ok) {
        toast.error(data.error || "Failed to add contact");
      } else {
        toast.success("Contact added successfully");
        onNext();
      }
    } catch (error) {
      console.error("Failed to add contact:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {uploadSuccess && (
        <Alert className="flex items-center gap-2 bg-green-500/10 border-green-500/20 text-green-700">
          <AlertDescription className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Contacts have been successfully imported! You can continue or import
            more contacts.
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
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setError(null);
                    setFormData({ ...formData, email: e.target.value });
                  }}
                  required
                  className={error ? "border-red-500" : ""}
                />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
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
                      Your CSV should include columns for: First Name, Last
                      Name, and Email Address
                    </p>
                  </div>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="cursor-pointer max-w-sm"
                    disabled={isLoading}
                  />
                  {parsedContacts && (
                    <>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileSpreadsheet className="h-4 w-4" />
                        {parsedContacts.file.name} (
                        {parsedContacts.contacts.length} contacts)
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleFileDelete}
                          className="h-6 w-6"
                          disabled={isLoading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        onClick={handleUpload}
                        disabled={isLoading}
                        className="w-48"
                      >
                        {isLoading ? (
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
                    </>
                  )}
                </div>
              </Card>

              <Alert className="flex items-center gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
                <AlertDescription className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  CSV file can contain up to 1,000 contacts. Any additional
                  contacts will be ignored to prevent system abuse.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onNext}>
          I'll do this later
        </Button>
        {selectedMethod === "manual" ? (
          <Button onClick={handleManualSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Contact"
            )}
          </Button>
        ) : (
          <Button onClick={onNext} disabled={isLoading}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
