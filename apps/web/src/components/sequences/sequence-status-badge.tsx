import { Badge } from "@coldjot/ui/components/badge";

interface SequenceStatusBadgeProps {
  status: string;
}

export function SequenceStatusBadge({ status }: SequenceStatusBadgeProps) {
  switch (status.toLowerCase()) {
    case "draft":
      return (
        <Badge variant="outline" className="bg-muted">
          Draft
        </Badge>
      );
    case "active":
      return (
        <Badge
          variant="outline"
          className="bg-green-100 text-green-800 border-green-200"
        >
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-100 text-yellow-800 border-yellow-200"
        >
          Paused
        </Badge>
      );
    case "completed":
      return (
        <Badge
          variant="outline"
          className="bg-blue-100 text-blue-800 border-blue-200"
        >
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="bg-red-100 text-red-800 border-red-200"
        >
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-muted">
          {status}
        </Badge>
      );
  }
}
