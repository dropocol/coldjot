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
  isUserTimeline?: boolean;
}

export function TimelineHeader({
  sequence: _sequence,
  isLoading: _isLoading,
  onRefresh: _onRefresh,
  onExport: _onExport,
  isUserTimeline: _isUserTimeline = false,
}: TimelineHeaderProps) {
  return (
    <div className="space-y-4 border-b pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <TimelineFilters />
      </div>
    </div>
  );
}
