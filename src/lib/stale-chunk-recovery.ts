const RELOAD_FLAG = "lovable:chunk-reload";

function isStaleChunkError(message: string) {
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/**
 * After a new deploy, an open tab still references old asset hashes, so
 * lazily-imported route chunks 404 and the page goes blank. Reload once to
 * pick up the fresh manifest; the flag stops a reload loop when the chunk is
 * genuinely broken.
 */
export function installStaleChunkRecovery() {
  if (typeof window === "undefined") return;

  const recover = (message: string) => {
    if (!isStaleChunkError(message)) return false;
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, "1");
    window.location.reload();
    return true;
  };

  window.addEventListener("error", (event) => {
    recover(event.message ?? "");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recover(reason instanceof Error ? reason.message : String(reason ?? ""));
  });

  // A successful load means the current manifest is good again.
  window.setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
}

export function tryRecoverFromStaleChunk(error: unknown) {
  if (typeof window === "undefined") return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!isStaleChunkError(message)) return false;
  if (sessionStorage.getItem(RELOAD_FLAG)) return false;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
  return true;
}
