"use client";

import { Search, Loader2 } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "../lib/utils";

interface LocalSearchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  isLoading?: boolean;
  onSearch?: (value: string) => void;
}

export function LocalSearch({
  className,
  isLoading,
  onSearch,
  ...props
}: LocalSearchProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch?.(props.value as string);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Input
        {...props}
        type="search"
        className={cn("w-[300px] pr-9", className)}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </Button>
    </form>
  );
}
