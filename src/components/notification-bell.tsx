/**
 * Program alerts.
 *
 * Monitoring changes, high-fit discoveries and approaching deadlines are all
 * already in the database — this surfaces them in one place so nobody has to
 * remember to open the monitoring log. Derivation runs on load and is
 * deduplicated, so an alert appears once and stays until it is read.
 */
import { useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/program";
import { isClosed } from "@/lib/opportunity-view";
import {
  useDiscoveries,
  useMarkNotificationsRead,
  useNotifications,
  useOpportunityChanges,
  useOpportunities,
  useSyncNotifications,
} from "@/lib/hooks";
import { NOTIFICATION_LABEL, NOTIFICATION_TONE, deriveNotifications } from "@/lib/notifications";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const { data: notifications = [] } = useNotifications();
  const { data: opportunities = [] } = useOpportunities();
  const { data: changes = [] } = useOpportunityChanges({ pendingOnly: true });
  const { data: discoveries = [] } = useDiscoveries();
  const sync = useSyncNotifications();
  const markRead = useMarkNotificationsRead();
  const synced = useRef(false);

  const desired = useMemo(
    () =>
      deriveNotifications({
        opportunities: opportunities as never,
        changes: changes as never,
        discoveries: discoveries as never,
        closed: isClosed,
      }),
    [opportunities, changes, discoveries],
  );

  useEffect(() => {
    // One derivation pass per session is enough; the data behind it changes
    // on the monitoring cadence, not per render.
    if (synced.current) return;
    if (!opportunities.length && !changes.length && !discoveries.length) return;
    synced.current = true;
    sync.mutate(desired);
  }, [desired, opportunities.length, changes.length, discoveries.length, sync]);

  const unread = notifications.filter((n) => !n.read_at);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
        aria-label={`Alerts${unread.length ? ` (${unread.length} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unread.length ? (
          <span className="tabnum absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[9.5px] font-semibold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[24rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Program alerts
          </span>
          {unread.length ? (
            <button
              onClick={() => markRead.mutate("all")}
              className="text-[11.5px] text-primary hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <ul className="max-h-[26rem] overflow-auto">
          {notifications.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              Nothing needs attention right now.
            </li>
          ) : (
            notifications.map((n) => {
              const body = (
                <div
                  className={cn(
                    "block px-3 py-2.5 transition-colors hover:bg-muted",
                    !n.read_at && "bg-primary/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Chip tone={NOTIFICATION_TONE[n.kind] ?? "neutral"}>
                      {NOTIFICATION_LABEL[n.kind] ?? n.kind}
                    </Chip>
                    <span className="ml-auto text-[10.5px] text-muted-foreground">
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] font-medium">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">{n.body}</p>
                  ) : null}
                </div>
              );
              return (
                <li key={n.id} className="border-b border-border/60 last:border-0">
                  {n.link ? (
                    <Link to={n.link} onClick={() => markRead.mutate([n.id])}>
                      {body}
                    </Link>
                  ) : (
                    <button className="w-full text-left" onClick={() => markRead.mutate([n.id])}>
                      {body}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
