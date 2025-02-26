import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  User,
  Reply,
  MessageSquare,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailDetailsProps {
  fromName: string;
  setFromName: (value: string) => void;
  fromEmail: string;
  setFromEmail: (value: string) => void;
  replyTo: string;
  setReplyTo: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  previewText: string;
  setPreviewText: (value: string) => void;
}

export function EmailDetails({
  fromName,
  setFromName,
  fromEmail,
  setFromEmail,
  replyTo,
  setReplyTo,
  subject,
  setSubject,
  previewText,
  setPreviewText,
}: EmailDetailsProps) {
  const [showDetails, setShowDetails] = useState(true);
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);

  return (
    <div className="bg-white rounded-md shadow-sm border mb-6 overflow-hidden">
      {/* Header with toggle */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer border-b"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-500" />
          <h3 className="font-medium text-sm text-gray-700">Email Details</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </Button>
      </div>

      {/* Collapsible content */}
      <div
        className={cn(
          "grid gap-4 transition-all duration-300 ease-in-out",
          showDetails
            ? "grid-rows-[1fr] opacity-100 p-4"
            : "grid-rows-[0fr] opacity-0 p-0 h-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-[100px_1fr] gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <User className="h-4 w-4" />
              <span>Name</span>
            </div>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="border-gray-200"
              placeholder="Sender Name"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Mail className="h-4 w-4" />
              <span>From</span>
            </div>
            <div className="flex items-center">
              <Input
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="border-gray-200"
                placeholder="From email"
              />
              <span className="ml-2 text-sm text-gray-500">
                @mail.zeeshankhan.me
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Reply className="h-4 w-4" />
              <span>Reply</span>
            </div>
            <Input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className="border-gray-200"
              placeholder="Optional reply email"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <MessageSquare className="h-4 w-4" />
              <span>Subject</span>
            </div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-gray-200"
              placeholder="Subject line"
            />
          </div>

          {showAdditionalFields && (
            <div className="grid grid-cols-[100px_1fr] gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <Eye className="h-4 w-4" />
                <span>Preview</span>
              </div>
              <Input
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                className="border-gray-200"
                placeholder="Optional preview text"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowAdditionalFields(!showAdditionalFields);
              }}
              className="text-xs text-gray-500"
            >
              {showAdditionalFields
                ? "Hide optional fields"
                : "Show optional fields"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
