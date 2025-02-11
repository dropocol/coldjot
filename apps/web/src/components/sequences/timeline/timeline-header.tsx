"use client";

import { Download, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
}

export function TimelineHeader({
  sequence,
  isLoading,
  onRefresh,
  onExport,
}: TimelineHeaderProps) {
  const router = useRouter();

  return (
    <div className="space-y-4 border-b pb-4 flex items-center justify-between">
      <TimelineFilters />
      <div className="flex items-center justify-between">
        {/* <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {sequence.name}
          </h1>
          {sequence.emailList && (
            <p className="text-sm text-muted-foreground">
              Sending to list: {sequence.emailList.name}
            </p>
          )}
        </div> */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
