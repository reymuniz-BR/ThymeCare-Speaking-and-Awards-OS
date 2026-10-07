import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Home, Table2, PenLine, Library, MoreHorizontal, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The primary destinations. Everything else is secondary. */
const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/opportunities", label: "Opportunities", icon: Table2 },
  { to: "/discover", label: "Discover", icon: Radar },
  { to: "/submissions", label: "Submissions", icon: PenLine },
  { to: "/library", label: "Library", icon: Library },
] as const;

/** Occasional views, reachable from the overflow menu rather than the tab bar. */
const MORE = [
  { to: "/calendar", label: "Calendar view" },
  { to: "/speakers", label: "Speakers" },
  { to: "/monitoring", label: "Deadline monitoring log" },
  { to: "/activity", label: "Change history" },
  { to: "/settings", label: "Settings" },
] as const;

const TAB_CLASS =
  "flex items-center gap-2 border-b-2 border-transparent px-1 py-3 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground";

const TAB_ACTIVE_CLASS = cn(
  "flex items-center gap-2 border-b-2 px-1 py-3 text-[13px] whitespace-nowrap font-medium",
  "border-primary text-foreground",
);

export function AppShell({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Brand rail — dark, fixed, sets the "operating system" tone. */}
      <div className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex w-full max-w-[1500px] items-center gap-4 px-6 py-2.5">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-accent-foreground">
              T
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Thyme Care</div>
              <div className="text-[9.5px] tracking-[0.14em] text-sidebar-foreground/60 uppercase">
                Speaking &amp; Awards OS
              </div>
            </div>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <GlobalSearch />
            <Link
              to="/discover"
              className="hidden h-8 items-center gap-1.5 rounded-md border border-sidebar-foreground/20 px-2.5 text-[12.5px] text-sidebar-foreground/85 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground sm:inline-flex"
            >
              <Radar className="h-3.5 w-3.5" /> Find opportunities
            </Link>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                aria-label="More"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase">
                  Program tools
                </DropdownMenuLabel>
                {MORE.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="truncate text-[11px] font-normal text-muted-foreground">
                  {email}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="sticky top-[52px] z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1500px] gap-7 overflow-x-auto px-6">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={TAB_CLASS}
              activeProps={{ className: TAB_ACTIVE_CLASS }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[1500px] px-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="truncate text-[21px] leading-tight font-semibold tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>

        <main className="py-6">{children}</main>
      </div>
    </div>
  );
}
