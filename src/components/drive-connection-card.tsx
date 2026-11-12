/**
 * The one-time "Connect Google Drive" step. App sign-in never asks for Drive;
 * a manager grants it here once and the weekly syncs run on that connection.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/chip";
import {
  checkDriveAccess,
  disconnectDrive,
  getDriveConnection,
  startDriveConnect,
} from "@/lib/drive-connection.functions";
import { CheckCircle2, FolderSync, Loader2, XCircle } from "lucide-react";

type Access = Awaited<ReturnType<typeof checkDriveAccess>>;

const OUTCOME_MESSAGES: Record<string, string> = {
  denied: "Google Drive wasn't connected: the request was cancelled at Google.",
  invalid: "That connection attempt expired. Start it again from here.",
  forbidden: "Only a manager or admin can connect Google Drive.",
  scope: "Drive access wasn't ticked on Google's screen. Connect again and leave it ticked.",
  no_refresh: "Google didn't grant lasting access. Connect again.",
  failed: "Google Drive couldn't be connected. Try again, and tell your admin if it keeps failing.",
};

export function DriveConnectionCard() {
  const getStatus = useServerFn(getDriveConnection);
  const start = useServerFn(startDriveConnect);
  const check = useServerFn(checkDriveAccess);
  const disconnect = useServerFn(disconnectDrive);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"connect" | "check" | "disconnect" | null>(null);
  const [access, setAccess] = useState<Access | null>(null);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["drive_connection"],
    queryFn: () => getStatus(),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("drive");
    if (!outcome) return;
    if (outcome === "connected") toast.success("Google Drive connected");
    else toast.error(OUTCOME_MESSAGES[outcome] ?? OUTCOME_MESSAGES["failed"]);
    params.delete("drive");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<void>) {
    setBusy(kind);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong with Google Drive");
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    run("connect", async () => {
      const { url } = await start();
      window.location.assign(url);
    });

  const verify = () => run("check", async () => setAccess(await check()));

  const remove = () =>
    run("disconnect", async () => {
      if (
        !window.confirm(
          "Disconnect Google Drive? The weekly syncs will stop until it's reconnected.",
        )
      ) {
        return;
      }
      await disconnect();
      setAccess(null);
      await queryClient.invalidateQueries({ queryKey: ["drive_connection"] });
      toast.success("Google Drive disconnected");
    });

  const state = connection?.status ?? "not_connected";
  const connected = state === "connected";

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FolderSync className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Google Drive connection</h2>
        {!isLoading ? (
          <Chip tone={connected ? "success" : state === "needs_reconnect" ? "critical" : "neutral"}>
            {connected
              ? "Connected"
              : state === "needs_reconnect"
                ? "Needs reconnecting"
                : "Not connected"}
          </Chip>
        ) : null}
        {connection?.canManage ? (
          <div className="ml-auto flex gap-2">
            {connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={verify}
                  disabled={!!busy}
                >
                  {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Check file access
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={remove}
                  disabled={!!busy}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8"
                onClick={connect}
                disabled={!!busy || !connection.configured}
              >
                {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {state === "needs_reconnect" ? "Reconnect Google Drive" : "Connect Google Drive"}
              </Button>
            )}
          </div>
        ) : null}
      </header>

      <div className="px-4 py-3 text-[12.5px] text-muted-foreground">
        {connected ? (
          <>
            Connected as{" "}
            <span className="text-foreground">
              {connection?.connectedEmail ?? "an unknown account"}
            </span>
            . The content library, master messaging doc and master tracker sync through this
            account, including the scheduled runs. Nobody else needs to connect anything.
          </>
        ) : state === "needs_reconnect" ? (
          "Google stopped accepting the saved login, so Drive syncs are paused. Reconnect with an account that can open the team's files."
        ) : connection && !connection.configured ? (
          "Drive sign-in hasn't been set up on this deployment yet."
        ) : (
          "Connect once with a Google account that can open the team's files. Everyone else keeps signing in with their own account and never has to do this."
        )}
      </div>

      {access ? (
        <ul className="border-t border-border px-4 py-3 text-[12.5px]">
          {access.map((item) => (
            <li key={item.label} className="flex items-center gap-2 py-0.5">
              {item.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              )}
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground">
                {item.ok ? item.name : "This account can't open it"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
