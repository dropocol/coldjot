"use client";

import { format, formatDistanceToNow } from "date-fns";
import { Eye, MousePointerClick, Mail, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EmailTracking } from "@/types/email";

interface TimelineItemProps {
  email: EmailTracking & {
    contact?: {
      name: string;
      email: string;
    } | null;
  };
  onSelect: (email: EmailTracking) => void;
}

export function TimelineItem({ email, onSelect }: TimelineItemProps) {
  const openEvents = email.events.filter((e) => e.type === "opened");
  const openCount = openEvents.length;
  const clickEvents = email.events.filter((e) => e.type === "clicked");
  const clickCount = email.links.reduce(
    (acc, link) => acc + link.clickCount,
    0
  );
  const hasReplies = email.events.some((e) => e.type === "replied");
  const hasBounces = email.events.some((e) => e.type === "bounced");

  // Sort events by timestamp to get first and latest
  const sortedOpenEvents = [...openEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstOpenTime =
    sortedOpenEvents[sortedOpenEvents.length - 1]?.timestamp;
  const latestOpenTime = sortedOpenEvents[0]?.timestamp;

  const sortedClickEvents = [...clickEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstClickTime =
    sortedClickEvents[sortedClickEvents.length - 1]?.timestamp;
  const latestClickTime = sortedClickEvents[0]?.timestamp;

  // Format message ID to be shorter
  const shortMessageId = email.messageId.slice(0, 8);

  return (
    <div
      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onSelect(email)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium flex-1">{email.subject}</div>
            {/* <div className="text-xs text-muted-foreground font-mono">
              {shortMessageId}
            </div> */}
          </div>
          <div className="text-sm text-muted-foreground/80">
            {email.contact ? (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">
                  To: {email.contact.name}{" "}
                  <span className="text-muted-foreground/60">
                    ({email.contact.email})
                  </span>
                </span>

                {hasReplies && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-green-600 bg-green-100 text-xs font-normal"
                  >
                    <Mail className="h-3 w-3 text-green-500" />
                    Replied
                  </Badge>
                )}

                {hasBounces && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Bounced
                  </Badge>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {email.recipientEmail}
              </span>
            )}
          </div>
          {email.previewText && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {email.previewText}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-end gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{openCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="space-y-1">
                  <p>Opened {openCount} times</p>
                  {firstOpenTime && (
                    <p className="text-xs text-white">
                      First:{" "}
                      {formatDistanceToNow(new Date(firstOpenTime), {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                  {latestOpenTime && (
                    <p className="text-xs text-white">
                      Latest:{" "}
                      {formatDistanceToNow(new Date(latestOpenTime), {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{clickCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="space-y-1">
                  <p>Clicked {clickCount} times</p>
                  {firstClickTime && (
                    <p className="text-xs text-muted-foreground">
                      First:{" "}
                      {formatDistanceToNow(new Date(firstClickTime), {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                  {latestClickTime && (
                    <p className="text-xs text-muted-foreground">
                      Latest:{" "}
                      {formatDistanceToNow(new Date(latestClickTime), {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="text-xs text-muted-foreground text-right">
            {format(new Date(email.sentAt!), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>
      </div>
    </div>
  );
}
