"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  FileText,
  Mail,
  Settings,
  Building2,
  Menu,
  X,
  ChevronLeft,
  Search,
  Sparkles,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { GlobalSearch } from "@/components/layout/GlobalSearch";

const composeRoute = {
  label: "Compose",
  icon: Mail,
  href: "/compose",
  isPrimary: true,
};

const managementRoutes = [
  {
    label: "Home",
    icon: Home,
    href: "/",
  },
  {
    label: "Sequences",
    icon: Sparkles, // Assuming Sparkles icon is suitable; replace with appropriate icon if needed
    href: "/sequences",
  },
  {
    label: "Timeline",
    icon: Calendar,
    href: "/timeline",
  },

  {
    label: "Templates",
    icon: FileText,
    href: "/templates",
  },
  {
    label: "Lists",
    icon: Mail, // Assuming Mail icon is suitable; replace with appropriate icon if needed
    href: "/lists",
  },
  {
    label: "Contacts",
    icon: Users,
    href: "/contacts",
  },
];

const otherRoutes = [
  {
    label: "Settings",
    icon: Settings,
    href: "/settings/profile",
  },
];

const apolloRoute = {
  label: "Apollo Search",
  icon: Sparkles,
  secondaryIcon: Search,
  href: "/apollo",
  description: "Find new prospects",
};

const searchRoute = {
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
        "text-xs font-medium text-muted-foreground px-3 mb-2",
        isCollapsed && "hidden"
      )}
    >
      {children}
    </h3>
  );

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r bg-white transition-all duration-300",
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
          <div
            className={`relative h-8 ${
              isCollapsed ? "w-20" : "w-24"
            } overflow-hidden`}
          >
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
          className="ml-auto h-8 w-8 transition-all duration-300"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-all",
              isCollapsed && "rotate-180"
            )}
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

            {managementRoutes.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                className={cn(
                  "flex items-center gap-x-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all hover:bg-gray-100 h-8",
                  "text-gray-500 hover:text-gray-900",
                  pathname === route.href && "bg-gray-100 text-gray-900",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <route.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    pathname === route.href ? "text-gray-900" : "text-gray-500"
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
          </div>

          {/* Tools Section */}
          {/* <div className="space-y-2">
            <SectionTitle>Tools</SectionTitle>
            <Link
              href={apolloRoute.href}
              className={cn(
                "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-gray-100",
                "text-gray-500 hover:text-gray-900 group",
                pathname === apolloRoute.href && "bg-gray-100 text-gray-900",
                isCollapsed && "justify-center px-2"
              )}
            >
              <div className="relative">
                <apolloRoute.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    pathname === apolloRoute.href
                      ? "text-gray-900"
                      : "text-gray-500"
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
                "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-gray-100",
                "text-gray-500 hover:text-gray-900",
                pathname === searchRoute.href && "bg-gray-100 text-gray-900",
                isCollapsed && "justify-center px-2"
              )}
            >
              <searchRoute.icon
                className={cn(
                  "h-5 w-5 flex-shrink-0",
                  pathname === searchRoute.href
                    ? "text-gray-900"
                    : "text-gray-500"
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
                  "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-gray-100",
                  "text-gray-500 hover:text-gray-900",
                  pathname === route.href && "bg-gray-100 text-gray-900",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <route.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    pathname === route.href ? "text-gray-900" : "text-gray-500"
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
          {otherRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-gray-100",
                "text-gray-500 hover:text-gray-900",
                pathname === route.href && "bg-gray-100 text-gray-900",
                isCollapsed && "justify-center px-2"
              )}
            >
              <route.icon
                className={cn(
                  "h-5 w-5 flex-shrink-0",
                  pathname === route.href ? "text-gray-900" : "text-gray-500"
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
        </div>
      </div>

      {session?.user && (
        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-2 px-2",
                  isCollapsed && "justify-center"
                )}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={session.user.image || ""} />
                  <AvatarFallback>
                    {session.user.name?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "truncate transition-all duration-300",
                    isCollapsed && "hidden w-0 opacity-0"
                  )}
                >
                  {session.user.name}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[200px]"
              side="right"
              sideOffset={18}
            >
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-red-600"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
