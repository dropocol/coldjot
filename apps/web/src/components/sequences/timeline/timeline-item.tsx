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
  const openCount = email.events.filter((e) => e.type === "opened").length;
  const clickCount = email.links.reduce(
    (acc, link) => acc + link.clickCount,
    0
  );
  const hasReplies = email.events.some((e) => e.type === "replied");
  const hasBounces = email.events.some((e) => e.type === "bounced");

  const firstOpenTime = email.events.find(
    (e) => e.type === "opened"
  )?.timestamp;
  const firstClickTime = email.events.find(
    (e) => e.type === "clicked"
  )?.timestamp;

  // Format message ID to be shorter
  const shortMessageId = email.messageId.slice(0, 8);

  return (
    <div
      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onSelect(email)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium flex-1">{email.subject}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {shortMessageId}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Sent to{" "}
            {email.contact ? (
              <span>
                {email.contact.name} ({email.contact.email})
              </span>
            ) : (
              email.recipientEmail
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(email.sentAt!), "MMM d, yyyy 'at' h:mm a")}
          </div>
          {email.previewText && (
            <div className="text-sm text-muted-foreground line-clamp-1">
              {email.previewText}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{openCount}</span>
                  {firstOpenTime && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (
                      {formatDistanceToNow(new Date(firstOpenTime), {
                        addSuffix: true,
                      })}
                      )
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Opened {openCount} times</p>
                {firstOpenTime && (
                  <p className="text-xs">
                    First opened{" "}
                    {formatDistanceToNow(new Date(firstOpenTime), {
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
                  {firstClickTime && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (
                      {formatDistanceToNow(new Date(firstClickTime), {
                        addSuffix: true,
                      })}
                      )
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clicked {clickCount} times</p>
                {firstClickTime && (
                  <p className="text-xs">
                    First clicked{" "}
                    {formatDistanceToNow(new Date(firstClickTime), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {hasReplies && (
            <Badge variant="secondary" className="gap-1">
              <Mail className="h-3 w-3" />
              Replied
            </Badge>
          )}

          {hasBounces && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Bounced
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
