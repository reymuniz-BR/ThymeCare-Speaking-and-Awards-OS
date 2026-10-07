import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — submissions now live under /submissions/$id. */
export const Route = createFileRoute("/_authenticated/workspace_/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/submissions/$id", params: { id: params.id } });
  },
  component: () => null,
});
