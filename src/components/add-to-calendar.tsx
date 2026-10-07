import { CalendarPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildIcs,
  downloadIcs,
  googleCalendarUrl,
  slugify,
  type CalendarEvent,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Props = {
  event: CalendarEvent;
  className?: string;
  /** Compact icon-only trigger for dense rows. */
  compact?: boolean;
};

/** Adds a single deadline to Google Calendar, or downloads it as an .ics file. */
export function AddToCalendar({ event, className, compact = true }: Props) {
  if (!event.date) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Add ${event.title} to calendar`}
        title="Add to calendar"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded border border-border text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground",
          compact ? "h-6 w-6 justify-center" : "h-8 px-2.5",
          className,
        )}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        {compact ? null : "Add to calendar"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
            Add to Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => downloadIcs(slugify(event.title), buildIcs([event], event.title))}
        >
          Download .ics file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
