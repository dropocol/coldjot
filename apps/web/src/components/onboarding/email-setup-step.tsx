import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-hot-toast";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface EmailSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  hasConnectedEmail?: boolean;
}

export function EmailSetupStep({
  onNext,
  onBack,
  hasConnectedEmail = false,
}: EmailSetupStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const emailProviders = [
    {
      id: "gmail",
      name: "Gmail",
      icon: "/images/gmail.svg",
      description: "Connect your Gmail or Google Workspace account",
    },
  ];

  const handleConnectGmail = async () => {
    try {
      setIsConnecting(true);
      const response = await fetch("/api/mailboxes/gmail/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnPath: pathname }),
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Gmail connection");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Gmail connection error:", error);
      toast.error("Failed to connect Gmail account");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {hasConnectedEmail ? (
        <Alert className="flex items-center gap-2 bg-emerald-500/10 border-emerald-500/20 text-emerald-700">
          <AlertDescription className="text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Email account successfully connected! You can proceed to the next
            step.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="flex items-center gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
          <AlertDescription className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Your credentials are securely stored and we only request the minimum
            required permissions.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {emailProviders.map((provider) => (
          <Card
            key={provider.id}
            className={cn(
              "p-6 transition-colors shadow-none",
              !hasConnectedEmail && "hover:bg-accent cursor-pointer"
            )}
            onClick={!hasConnectedEmail ? handleConnectGmail : undefined}
          >
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-background p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={provider.icon}
                  alt={provider.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{provider.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {provider.description}
                </p>
              </div>
              {isConnecting ? (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              ) : hasConnectedEmail ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <Mail className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onNext}>
          I'll do this later
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
