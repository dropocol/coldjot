"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SequenceTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  children: React.ReactNode;
}

export const SequenceTabs = ({
  activeTab,
  onTabChange,
  children,
}: SequenceTabsProps) => {
  const tabStyle =
    "relative rounded-t-lg px-4 pb-4 pt-3 font-medium text-muted-foreground hover:text-primary transition-colors data-[state=active]:bg-accent/30 data-[state=active]:text-primary shadow-none data-[state=active]:shadow-none before:absolute before:bottom-[-1px] before:left-0 before:right-0 before:h-[2px] before:bg-transparent data-[state=active]:before:bg-primary";

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="w-full h-14 bg-transparent p-0 mb-2 relative">
        <div className="flex gap-0 max-w-7xl mx-auto border-b w-full">
          <TabsTrigger value="overview" className={tabStyle}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="contacts" className={tabStyle}>
            Contacts
          </TabsTrigger>
          <TabsTrigger value="timeline" className={tabStyle}>
            Timeline
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabStyle}>
            Settings
          </TabsTrigger>
        </div>
      </TabsList>
      {children}
    </Tabs>
  );
};
