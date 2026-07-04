"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@coldjot/ui/lib/utils";
import {
  LayoutGrid,
  Workflow,
  CalendarDays,
  SquarePen,
  Mails,
  Contact,
  Settings2,
  ChevronsLeft,
  Search,
  Sparkles,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { ScrollArea } from "@coldjot/ui/components/scroll-area";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@coldjot/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coldjot/ui/components/dropdown-menu";

import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { ModeToggle } from "@/components/mode-toggle";

const _composeRoute = {
  label: "Compose",
  icon: Mail,
  href: "/compose",
  isPrimary: true,
};

const managementRoutes = [
  {
    label: "Home",
    icon: LayoutGrid,
    href: "/",
  },
  {
    label: "Sequences",
    icon: Workflow,
    href: "/sequences",
  },
  {
    label: "Timeline",
    icon: CalendarDays,
    href: "/timeline",
  },

  {
    label: "Templates",
    icon: SquarePen,
    href: "/templates",
  },
  {
    label: "Lists",
    icon: Mails,
    href: "/lists",
  },
  {
    label: "Contacts",
    icon: Contact,
    href: "/contacts",
  },
];

const otherRoutes = [
  {
    label: "Settings",
    icon: Settings2,
    href: "/settings/profile",
  },
];

const _apolloRoute = {
  label: "Apollo Search",
  icon: Sparkles,
  secondaryIcon: Search,
  href: "/apollo",
  description: "Find new prospects",
};

const _searchRoute = {
  label: "Search",
  icon: Search,
  href: "/search",
  description: "Search across all data",
};

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: session } = useSession();

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3
      className={cn(
        "px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70",
        isCollapsed && "hidden"
      )}
    >
      {children}
    </h3>
  );

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r bg-background transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center px-4">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 font-semibold tracking-tight",
            isCollapsed && "justify-center"
          )}
        >
          <div className={`relative h-8 ${isCollapsed ? "w-20" : "w-24"} overflow-hidden`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.svg"
              alt="ColdJot"
              className={cn(
                "absolute left-0 top-0 h-8 w-24 object-contain transition-opacity duration-300",
                isCollapsed ? "opacity-0" : "opacity-100"
              )}
            />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo-small.svg"
              alt="ColdJot"
              className={cn(
                "absolute left-0 top-0 h-8 w-8 object-contain transition-opacity duration-300",
                isCollapsed ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft
            className={cn("size-4 transition-transform duration-300", isCollapsed && "rotate-180")}
          />
        </Button>
      </div>

      <div className="px-3 py-2">
        <GlobalSearch isCollapsed={isCollapsed} />
      </div>

      <ScrollArea className="flex-1 px-3 h-full">
        <div className="space-y-6 py-4 h-full flex-1">
          {/* Compose Section */}
          {/* <div>
            <Link
              href={composeRoute.href}
              className={cn(
                "flex w-full items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                isCollapsed && "justify-center px-2"
              )}
            >
              <composeRoute.icon className="h-5 w-5 flex-shrink-0" />
              <span
                className={cn(
                  "transition-all duration-300",
                  isCollapsed && "hidden w-0 opacity-0"
                )}
              >
                {composeRoute.label}
              </span>
            </Link>
          </div> */}

          {/* Management Section */}
          <div className="space-y-2">
            <SectionTitle>Management</SectionTitle>

            {managementRoutes.map((route) => {
              const isActive = pathname === route.href;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  title={isCollapsed ? route.label : undefined}
                  className={cn(
                    "group relative flex h-8 items-center gap-x-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    isCollapsed && "justify-center px-0"
                  )}
                >
                  {/* Active accent bar */}
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <route.icon
                    className={cn(
                      "size-[18px] shrink-0 text-foreground transition-colors",
                    )}
                    strokeWidth={isActive ? 2.25 : 2}
                  />
                  <span
                    className={cn(
                      "truncate transition-all duration-200",
                      isCollapsed && "hidden w-0 opacity-0"
                    )}
                  >
                    {route.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Tools Section */}
          {/* <div className="space-y-2">
            <SectionTitle>Tools</SectionTitle>
            <Link
              href={apolloRoute.href}
              className={cn(
                "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted",
                "text-muted-foreground hover:text-foreground group",
                pathname === apolloRoute.href && "bg-muted text-foreground",
                isCollapsed && "justify-center px-2"
              )}
            >
              <div className="relative">
                <apolloRoute.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    pathname === apolloRoute.href
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                />
                <apolloRoute.secondaryIcon className="h-3 w-3 absolute -right-1 -bottom-1 text-primary" />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span>{apolloRoute.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {apolloRoute.description}
                  </span>
                </div>
              )}
            </Link>

            <Link
              href={searchRoute.href}
              className={cn(
                "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted",
                "text-muted-foreground hover:text-foreground",
                pathname === searchRoute.href && "bg-muted text-foreground",
                isCollapsed && "justify-center px-2"
              )}
            >
              <searchRoute.icon
                className={cn(
                  "h-5 w-5 flex-shrink-0",
                  pathname === searchRoute.href
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              />
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span>{searchRoute.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {searchRoute.description}
                  </span>
                </div>
              )}
            </Link>
          </div> */}

          {/* System Section */}
          {/* <div className="space-y-2">
            <SectionTitle>System</SectionTitle>
            {otherRoutes.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted",
                  "text-muted-foreground hover:text-foreground",
                  pathname === route.href && "bg-muted text-foreground",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <route.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    pathname === route.href ? "text-foreground" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "transition-all duration-300",
                    isCollapsed && "hidden w-0 opacity-0"
                  )}
                >
                  {route.label}
                </span>
              </Link>
            ))}
          </div> */}
        </div>
      </ScrollArea>

      {/* System Section */}
      <div className="px-3 py-2">
        <div className="space-y-2">
          {otherRoutes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                title={isCollapsed ? route.label : undefined}
                className={cn(
                  "group relative flex h-8 items-center gap-x-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <route.icon
                  className={cn(
                    "size-[18px] shrink-0 text-foreground transition-colors",
                  )}
                  strokeWidth={isActive ? 2.25 : 2}
                />
                <span
                  className={cn(
                    "truncate transition-all duration-200",
                    isCollapsed && "hidden w-0 opacity-0"
                  )}
                >
                  {route.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {session?.user && (
        <div className="border-t p-3">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className={cn(
                      "flex-1 justify-start gap-2 px-2",
                      isCollapsed && "justify-center"
                    )}
                  />
                }
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={session.user.image || ""} />
                  <AvatarFallback>{session.user.name?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "truncate transition-all duration-300",
                    isCollapsed && "hidden w-0 opacity-0"
                  )}
                >
                  {session.user.name}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]" side="right" sideOffset={18}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ModeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
