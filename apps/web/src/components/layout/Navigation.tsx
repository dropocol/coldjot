import { Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@coldjot/ui/components/button";
export function Navigation() {
  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      {/* ... other navigation links */}

      <Link
        href="/search"
        className="text-sm font-medium transition-colors hover:text-primary"
      >
        <Button variant="outline" className="gap-2">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </Link>

      {/* ... other navigation items */}
    </nav>
  );
}
