"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  MousePointerClick,
  Mail,
  AlertCircle,
  Clock,
  Globe,
  User,
  Send,
  ExternalLink,
} from "lucide-react";
import type { EmailTracking } from "@/types/email";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmailDetailsDrawerProps {
  email: EmailTracking | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EmailDetailsDrawer({
  email,
  isOpen,
  onClose,
}: EmailDetailsDrawerProps) {
  if (!email) return null;

  const openEvents = email.events.filter((e) => e.type === "opened");
  const clickEvents = email.events.filter((e) => e.type === "clicked");
  const bounceEvents = email.events.filter((e) => e.type === "bounced");
  const replyEvents = email.events.filter((e) => e.type === "replied");

  const totalClicks = email.links.reduce(
    (acc, link) => acc + link.clickCount,
    0
  );

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Email Details</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
          <div className="space-y-6 py-6">
            {/* Email Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Subject</h3>
                <p className="text-sm text-muted-foreground">{email.subject}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Recipient</h3>
                <p className="text-sm text-muted-foreground">
                  {email.contact ? (
                    <span>
                      {email.contact.name} ({email.contact.email})
                    </span>
                  ) : (
                    email.recipientEmail
                  )}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Message ID</h3>
                <p className="text-sm font-mono text-muted-foreground">
                  {email.messageId}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Sent At</h3>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(email.sentAt!), "PPpp")}
                </p>
              </div>
            </div>

            <Separator />

            {/* Stats */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Opens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-2xl font-bold">
                      {openEvents.length}
                    </div>
                    {openEvents.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        First opened{" "}
                        {formatDistanceToNow(
                          new Date(openEvents[openEvents.length - 1].timestamp),
                          { addSuffix: true }
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4" />
                      Clicks
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-2xl font-bold">{totalClicks}</div>
                    {clickEvents.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        First clicked{" "}
                        {formatDistanceToNow(
                          new Date(
                            clickEvents[clickEvents.length - 1].timestamp
                          ),
                          { addSuffix: true }
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator />

            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              {replyEvents.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Mail className="h-3 w-3" />
                  Replied
                </Badge>
              )}

              {bounceEvents.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Bounced
                </Badge>
              )}
            </div>

            <Separator />

            {/* Activity Timeline */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Activity Timeline</h3>
              <div className="space-y-4">
                {email.events
                  .sort(
                    (a, b) =>
                      new Date(b.timestamp).getTime() -
                      new Date(a.timestamp).getTime()
                  )
                  .map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 text-sm"
                    >
                      <div className="mt-0.5">
                        {event.type === "sent" && (
                          <Send className="h-4 w-4 text-muted-foreground" />
                        )}
                        {event.type === "opened" && (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        {event.type === "clicked" && (
                          <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                        )}
                        {event.type === "bounced" && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                        {event.type === "replied" && (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">
                          {event.type === "sent" && "Email sent"}
                          {event.type === "opened" && "Email opened"}
                          {event.type === "clicked" &&
                            `Link clicked: ${
                              event.metadata.originalUrl || "Unknown URL"
                            }`}
                          {event.type === "bounced" && "Email bounced"}
                          {event.type === "replied" && "Email replied"}
                        </p>
                        <p className="text-muted-foreground">
                          {format(new Date(event.timestamp), "PPpp")}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Tracked Links */}
            {email.links.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Tracked Links</h3>
                  <div className="space-y-4">
                    {email.links.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium break-all">
                            {link.originalUrl}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Clicked {link.clickCount} times
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="shrink-0"
                        >
                          <a
                            href={link.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
