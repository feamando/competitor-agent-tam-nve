/**
 * Navigation Component - Migrated to Design System
 * Main application navigation with theme support and accessibility
 * Part of Phase 4: Migration & Integration (Task 7.2)
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  HomeIcon, 
  DocumentTextIcon, 
  UserGroupIcon, 
  ChatBubbleLeftRightIcon, 
  FolderIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { cn } from "@/lib/utils";

// Navigation configuration
const navigation = [
  { 
    name: "Dashboard", 
    href: "/", 
    icon: HomeIcon,
    description: "Overview and metrics" 
  },
  { 
    name: "Chat Agent", 
    href: "/chat", 
    icon: ChatBubbleLeftRightIcon,
    description: "AI-powered competitor analysis",
    badge: "AI" 
  },
  { 
    name: "Projects", 
    href: "/projects", 
    icon: FolderIcon,
    description: "Manage research projects" 
  },
  { 
    name: "Competitors", 
    href: "/competitors", 
    icon: UserGroupIcon,
    description: "Track competitor data" 
  },
  { 
    name: "Reports", 
    href: "/reports", 
    icon: DocumentTextIcon,
    description: "Analysis reports and insights" 
  },
];

// Navigation item component
interface NavigationItemProps {
  item: typeof navigation[0];
  isActive: boolean;
  onClick?: () => void;
  className?: string;
}

function NavigationItem({ item, isActive, onClick, className }: NavigationItemProps) {
  const IconComponent = item.icon;
  
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive && "bg-accent text-accent-foreground",
        className
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <IconComponent 
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )} 
        aria-hidden="true"
      />
      <span className="flex-1">{item.name}</span>
      {item.badge && (
        <Badge variant="secondary" className="ml-auto">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

// Mobile navigation component
interface MobileNavigationProps {
  currentPath: string;
}

function MobileNavigation({ currentPath }: MobileNavigationProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Bars3Icon className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <div className="flex items-center gap-2 px-2 py-4">
          <Link 
            href="/" 
            className="flex items-center gap-2 font-bold text-primary"
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">CompAI</span>
          </Link>
        </div>
        
        <Separator className="mb-4" />
        
        <nav className="space-y-1">
          {navigation.map((item) => (
            <NavigationItem
              key={item.name}
              item={item}
              isActive={currentPath === item.href}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>
        
        <Separator className="my-4" />
        
        <div className="space-y-2">
          <div className="px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Competitor Research Agent
            </p>
          </div>
          
          <div className="flex items-center justify-between px-3">
            <span className="text-sm font-medium">Theme</span>
            <ThemeToggle size="sm" />
          </div>
          
          <div className="px-3">
            <LogoutButton />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Desktop navigation component
interface DesktopNavigationProps {
  currentPath: string;
}

function DesktopNavigation({ currentPath }: DesktopNavigationProps) {
  return (
    <nav className="hidden md:flex md:items-center md:space-x-1">
      {navigation.map((item) => (
        <NavigationItem
          key={item.name}
          item={item}
          isActive={currentPath === item.href}
          className="px-4 py-2"
        />
      ))}
    </nav>
  );
}

// Main navigation component
export interface NavigationProps {
  className?: string;
}

export function Navigation({ className }: NavigationProps) {
  const pathname = usePathname();

  return (
    <header 
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Mobile Menu */}
          <div className="flex items-center gap-4">
            <MobileNavigation currentPath={pathname} />
            
            <Link 
              href="/" 
              className="flex items-center gap-2 font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <span className="text-xl">CompAI</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <DesktopNavigation currentPath={pathname} />

          {/* Right side actions */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <p className="text-sm text-muted-foreground">
                Competitor Research Agent
              </p>
            </div>
            
            <div className="hidden md:block">
              <ThemeToggle size="sm" variant="ghost" />
            </div>
            
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}

// Enhanced navigation with breadcrumbs
export interface NavigationWithBreadcrumbsProps extends NavigationProps {
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

export function NavigationWithBreadcrumbs({ 
  breadcrumbs, 
  className,
  ...props 
}: NavigationWithBreadcrumbsProps) {
  return (
    <div className={className}>
      <Navigation {...props} />
      
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-2">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2 text-sm">
                {breadcrumbs.map((breadcrumb, index) => (
                  <li key={index} className="flex items-center">
                    {index > 0 && (
                      <span className="mx-2 text-muted-foreground">/</span>
                    )}
                    {breadcrumb.href ? (
                      <Link
                        href={breadcrumb.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {breadcrumb.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">
                        {breadcrumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

// Export for backwards compatibility
export default Navigation;
