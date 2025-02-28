import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronDown, Clock, Eye, Save, Send, Pencil } from "lucide-react";
import { useState } from "react";

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
  const [isEditing, setIsEditing] = useState(false);
  const [templateName, setTemplateName] = useState(title);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
  };

  return (
    <div
      id="editor-status-bar"
      className="sticky top-0 z-20 w-full border-b bg-white"
    >
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center group">
            {isEditing ? (
              <form onSubmit={handleNameSubmit} className="flex items-center">
                <span className="text-lg mr-2">😔</span>
                <Input
                  autoFocus
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="h-7 text-base w-[300px]"
                  onBlur={() => setIsEditing(false)}
                />
              </form>
            ) : (
              <div
                className="flex items-center cursor-pointer group"
                onClick={() => setIsEditing(true)}
              >
                <span className="text-lg mr-2">😔</span>
                <h1 className="text-base text-gray-900 truncate max-w-[200px] group-hover:text-gray-600">
                  {templateName}
                </h1>
                <Pencil className="h-3.5 w-3.5 ml-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-gray-100" />

          <TabsList className="bg-transparent p-0 h-14">
            <TabsTrigger
              value="design"
              className={cn(
                "rounded-none border-b-2 border-transparent px-3 h-full text-sm font-medium hover:text-gray-600 transition-colors data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none",
                activeTab === "design" && "border-primary text-primary"
              )}
              onClick={() => onTabChange("design")}
            >
              Design
            </TabsTrigger>
            <TabsTrigger
              value="details"
              className={cn(
                "rounded-none border-b-2 border-transparent px-3 h-full text-sm font-medium hover:text-gray-600 transition-colors data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none",
                activeTab === "details" && "border-primary text-primary"
              )}
              onClick={() => onTabChange("details")}
            >
              Details
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <Clock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Schedule send</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Preview email</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save template</p>
              </TooltipContent>
            </Tooltip>

            <Button size="sm" className="gap-1 bg-[#0F172A] hover:bg-[#1E293B]">
              <Send className="h-4 w-4" />
              <span className="text-xs">Send</span>
            </Button>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
