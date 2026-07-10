"use client";

import { TimelineFilters } from "./timeline-filters";

interface TimelineHeaderProps {
  sequence: {
    id: string;
    name: string;
    emailList?: {
      id: string;
      name: string;
    } | null;
  };
  isLoading?: boolean;
  onRefresh?: () => void;
  onExport?: () => void;
  // When true (the /timeline page), the title and filters are rendered at the
  // page level (inside PageHeader), so this component renders nothing.
  isUserTimeline?: boolean;
}

export function TimelineHeader({
  sequence: _sequence,
  isLoading: _isLoading,
  onRefresh: _onRefresh,
  onExport: _onExport,
  isUserTimeline = false,
}: TimelineHeaderProps) {
  if (isUserTimeline) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <TimelineFilters />
      </div>
    </div>
  );
}
