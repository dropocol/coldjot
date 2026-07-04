"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@coldjot/ui";
import { Label } from "@coldjot/ui";
import { Input } from "@coldjot/ui";
import { Textarea } from "@coldjot/ui";
import { Button } from "@coldjot/ui";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";

interface EmailSettingsData {
  defaultSubject?: string;
  defaultSignature?: string;
}

export default function EmailSettings() {
  const [defaultSubject, setDefaultSubject] = useState("");
  const [defaultSignature, setDefaultSignature] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "email"],
    queryFn: () => api.get<EmailSettingsData>("/api/settings/email"),
  });
  const save = useMutation({
    mutationFn: (input: EmailSettingsData) =>
      api.post("/api/settings/email", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "email"] }),
  });

  // Hydrate local form state once the settings load.
  useEffect(() => {
    if (data) {
      setDefaultSubject(data.defaultSubject || "");
      setDefaultSignature(data.defaultSignature || "");
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await save.mutateAsync({ defaultSubject, defaultSignature });
      toast.success("Settings saved successfully");
    } catch (_error) {
      toast.error("Failed to save settings");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">
        Email Preferences
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>Default Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultSubject">Default Subject Line</Label>
            <Input
              id="defaultSubject"
              value={defaultSubject}
              onChange={(e) => setDefaultSubject(e.target.value)}
              placeholder="Enter default subject line"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultSignature">Email Signature</Label>
            <Textarea
              id="defaultSignature"
              value={defaultSignature}
              onChange={(e) => setDefaultSignature(e.target.value)}
              placeholder="Enter your email signature"
              rows={4}
            />
          </div>

          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {save.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
