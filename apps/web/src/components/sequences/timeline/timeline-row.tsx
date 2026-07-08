"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Eye, MousePointerClick } from "lucide-react";
import { Badge } from "@coldjot/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coldjot/ui/components/tooltip";
import { TableRow, TableCell } from "@coldjot/ui/components/table";
import { cn } from "@coldjot/ui/lib/utils";
import type { EmailTrackingRow } from "@coldjot/types";

type EffectiveStatus =
  | "bounced"
  | "replied"
  | "clicked"
  | "opened"
  | "sent";

interface TimelineRowProps {
  email: EmailTrackingRow & {
    contact?: {
      name: string;
      email: string;
    } | null;
  };
  onSelect: (email: EmailTrackingRow) => void;
  /**
   * 4th column content: sequence name on the global timeline, step label on a
   * sequence timeline. On the global variant the sequence is rendered as a
   * link to that sequence (when `sequenceId` is present), so this is the
   * fallback label only when there is no sequence.
   */
  contextLabel?: React.ReactNode;
  /** Controls how the 4th column is rendered. */
  variant?: "global" | "sequence";
}

/** Highest-priority event an email has (bounced > replied > clicked > opened > sent). */
function getEffectiveStatus(email: EmailTrackingRow): EffectiveStatus {
  if (email.events.some((e) => e.type === "bounced")) return "bounced";
  if (email.events.some((e) => e.type === "replied")) return "replied";
  if (email.events.some((e) => e.type === "clicked")) return "clicked";
  if (email.events.some((e) => e.type === "opened")) return "opened";
  return "sent";
}

const STATUS_STYLES: Record<EffectiveStatus, string> = {
  bounced: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  replied: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  clicked: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  opened: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sent: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: EffectiveStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 capitalize text-xs font-medium px-2 py-0.5",
        STATUS_STYLES[status]
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "sent" ? "bg-muted-foreground" : `bg-current`
        )}
      />
      {status}
    </Badge>
  );
}

/** Cell with an icon + count and a first/latest tooltip. Shared by opens & clicks. */
function MetricCell({
  count,
  events,
  icon: Icon,
  label,
}: {
  count: number;
  events: { timestamp: Date | string }[];
  icon: typeof Eye;
  label: string;
}) {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const first = sorted[sorted.length - 1]?.timestamp;
  const latest = sorted[0]?.timestamp;

  return (
    <TableCell className="text-muted-foreground tabular-nums">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className="cursor-pointer inline-flex items-center gap-1"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-sm font-medium text-foreground">{count}</span>
          </TooltipTrigger>
          <TooltipContent className="space-y-1">
            <p>
              {label} {count} {count === 1 ? "time" : "times"}
            </p>
            {first && (
              <p className="text-xs text-primary-foreground">
                First: {formatDistanceToNow(new Date(first), { addSuffix: true })}
              </p>
            )}
            {latest && (
              <p className="text-xs text-primary-foreground">
                Latest:{" "}
                {formatDistanceToNow(new Date(latest), { addSuffix: true })}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableCell>
  );
}

export function TimelineRow({
  email,
  onSelect,
  contextLabel,
  variant = "global",
}: TimelineRowProps) {
  const status = getEffectiveStatus(email);
  const openEvents = email.events.filter((e) => e.type === "opened");
  const openCount = openEvents.length;
  const clickEvents = email.events.filter((e) => e.type === "clicked");
  const clickCount = email.links.reduce((acc, link) => acc + link.clickCount, 0);

  const contactName = email.contact?.name?.trim();
  const contactEmail = email.contact?.email ?? email.recipientEmail;

  const subject = email.subject ?? "";

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => onSelect(email)}
    >
      {/* Status */}
      <TableCell className="w-[90px] whitespace-nowrap">
        <StatusBadge status={status} />
      </TableCell>

      {/* Subject + preview */}
      <TableCell className="max-w-[320px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="font-medium truncate block w-full" />
              }
            >
              {subject}
            </TooltipTrigger>
            <TooltipContent className="max-w-[420px] break-words">
              <p>{subject}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {email.previewText && (
          <div className="text-xs text-muted-foreground line-clamp-1">
            {email.previewText}
          </div>
        )}
      </TableCell>

      {/* Recipient */}
      <TableCell className="hidden sm:table-cell max-w-[220px]">
        {contactName ? (
          <>
            <div className="truncate">{contactName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {contactEmail}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground truncate">{contactEmail}</span>
        )}
      </TableCell>

      {/* Context: sequence (global, clickable) or step (sequence-scoped). */}
      {contextLabel !== undefined && (
        <TableCell className="hidden lg:table-cell max-w-[160px]">
          {variant === "global" && email.sequenceId ? (
            <Link
              href={`/sequences/${email.sequenceId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-foreground underline-offset-2 hover:underline truncate block max-w-full"
            >
              {email.sequenceName || (
                <span className="text-muted-foreground/50">—</span>
              )}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground truncate block">
              {contextLabel ?? (
                <span className="text-muted-foreground/50">—</span>
              )}
            </span>
          )}
        </TableCell>
      )}

      {/* Opens */}
      <MetricCell
        count={openCount}
        events={openEvents}
        icon={Eye}
        label="Opened"
      />

      {/* Clicks */}
      <MetricCell
        count={clickCount}
        events={clickEvents}
        icon={MousePointerClick}
        label="Clicked"
      />

      {/* Sent */}
      <TableCell className="text-right whitespace-nowrap">
        {email.sentAt ? (
          <>
            <div className="text-sm">
              {format(new Date(email.sentAt), "MMM d, p")}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(email.sentAt), { addSuffix: true })}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
