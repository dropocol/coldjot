"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

export default function EmailSettings() {
  const [defaultSubject, setDefaultSubject] = useState("");
  const [defaultSignature, setDefaultSignature] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings/email");
      if (response.ok) {
        const settings = await response.json();
        setDefaultSubject(settings?.defaultSubject || "");
        setDefaultSignature(settings?.defaultSignature || "");
      }
    } catch (_error) {
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultSubject,
          defaultSignature,
        }),
      });

      if (!response.ok) throw new Error();
      toast.success("Settings saved successfully");
    } catch (_error) {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
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

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
