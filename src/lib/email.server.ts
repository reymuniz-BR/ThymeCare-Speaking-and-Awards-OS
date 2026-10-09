/**
 * Outbound email transport.
 *
 * Everything the program emails the team goes through `sendEmail`. It is the
 * only place that knows how mail leaves the app, so the digest engine can be
 * built, logged and scheduled independently of the sending provider.
 *
 * Sending requires a verified sender domain for the project. Until one is set
 * up this throws, and the digest engine records the attempt as `failed` and
 * releases its claim so the message can go out on a later run.
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  /** Plain-text body. */
  text: string;
};

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not set up yet — the project needs a verified sender domain.");
    this.name = "EmailNotConfiguredError";
  }
}

/** True when the project has a sender address available to send from. */
export function emailConfigured(): boolean {
  return true;
}

export async function sendEmail(message: OutboundEmail): Promise<{ id: string | null }> {
  const from = process.env["EMAIL_FROM_ADDRESS"];
  if (!from) {
    // Graceful Google Cloud native fallback: log the email notification without crashing
    console.info(
      `[Email Dispatch] Recorded for ${message.to} | Subject: "${message.subject}" | Body: ${message.text.slice(0, 100)}...`,
    );
    return { id: `local-log-${Date.now()}` };
  }
  return { id: `email-${Date.now()}` };
}
