import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — the workspace concept is now simply "Submissions". */
export const Route = createFileRoute("/_authenticated/workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/submissions" });
  },
  component: () => null,
});
