import { cn } from "@/lib/utils";
import { TONE_CLASS, labelize } from "@/lib/program";

type Tone = keyof typeof TONE_CLASS;

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusChip({ value, tone }: { value: string; tone: Tone }) {
  return <Chip tone={tone}>{labelize(value)}</Chip>;
}

export function TierChip({ tier }: { tier: number | null }) {
  if (!tier) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex h-5 w-8 items-center justify-center rounded border text-[11px] font-semibold",
        tier === 1
          ? "border-primary/40 bg-primary/10 text-primary"
          : tier === 2
            ? "border-border bg-muted text-muted-foreground"
            : "border-border bg-transparent text-muted-foreground",
      )}
    >
      T{tier}
    </span>
  );
}
