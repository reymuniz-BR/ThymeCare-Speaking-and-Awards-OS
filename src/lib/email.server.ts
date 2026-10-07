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
  return Boolean(process.env["EMAIL_FROM_ADDRESS"]);
}

export async function sendEmail(_message: OutboundEmail): Promise<{ id: string | null }> {
  // Wired to the project's managed email templates once a sender domain exists.
  throw new EmailNotConfiguredError();
}
