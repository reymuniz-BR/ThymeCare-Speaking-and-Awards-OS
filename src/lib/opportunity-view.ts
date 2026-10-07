/** Shared, presentation-level helpers for reading an opportunity record. */

/** The date the team should work to: final deadline, else the early deadline. */
export function bestDeadline(o: {
  final_deadline: string | null;
  early_deadline: string | null;
}): string | null {
  return o.final_deadline ?? o.early_deadline ?? null;
}

/**
 * Statuses that mean the opportunity is finished for this cycle. Single source
 * of truth — used by the dashboard, the weekly brief and monitoring so a closed
 * item can never surface as overdue or due soon.
 */
export const CLOSED_STATUSES = [
  "passed",
  "archived",
  "closed",
  "won",
  "lost",
  "declined",
  "submitted",
  "awaiting_results",
  "accepted",
  "finalist",
  "not_selected",
  "deadline_passed",
] as const;

const CLOSED_STATUS_SET = new Set<string>(CLOSED_STATUSES);

export function isClosed(status: string | null | undefined): boolean {
  return CLOSED_STATUS_SET.has(status ?? "");
}

/** Manual application state a team member sets on an opportunity. */
export const APPLICATION_STAGES = [
  { value: "drafting", label: "Drafting" },
  { value: "submitted", label: "Submitted" },
  { value: "declined", label: "Declined" },
  { value: "passed", label: "Passed" },
] as const;
