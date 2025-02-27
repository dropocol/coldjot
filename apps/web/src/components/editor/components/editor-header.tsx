import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChevronDown, Clock, Eye, Save, Send } from "lucide-react";

interface EditorHeaderProps {
  title: string;
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function EditorHeader({
  title,
  activeTab,
  onTabChange,
}: EditorHeaderProps) {
  return (
    <div
      id="editor-status-bar"
      className="sticky top-0 z-20 w-full border-b bg-white pb-0.5 shadow-sm"
    >
      <div className="flex items-center justify-between py-2 px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <div className="flex items-center">
              <span className="text-lg mr-2">😔</span>
              <h1 className="text-lg font-medium text-gray-900 truncate max-w-[200px]">
                {title}
              </h1>
            </div>
            <Button variant="ghost" size="sm" className="ml-2">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          <TabsList className="bg-transparent p-0 h-9">
            <TabsTrigger
              value="design"
              className={cn(
                "rounded-none border-b-2 border-transparent px-3 py-1.5 text-sm font-medium",
                activeTab === "design" && "border-primary text-primary"
              )}
              onClick={() => onTabChange("design")}
            >
              Design
            </TabsTrigger>
            <TabsTrigger
              value="details"
              className={cn(
                "rounded-none border-b-2 border-transparent px-3 py-1.5 text-sm font-medium",
                activeTab === "details" && "border-primary text-primary"
              )}
              onClick={() => onTabChange("details")}
            >
              Details
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Schedule</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1">
            <Eye className="h-4 w-4" />
            <span className="text-xs">Preview</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1">
            <Save className="h-4 w-4" />
            <span className="text-xs">Save</span>
          </Button>
          <Button size="sm" className="gap-1">
            <Send className="h-4 w-4" />
            <span className="text-xs">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
