/**
 * Master messaging document.
 *
 * A single Google Doc holds the client's approved company messaging. It is
 * pulled into the Content Library as tagged snippets so the submission centre
 * can both show the pillars in the workspace and always feed them to the AI
 * drafting features as canonical language.
 */

export const MASTER_MESSAGING_TAG = "master-messaging";

export const MASTER_MESSAGING_DOC_ID = "1oCDR8IvkKXs4bFU3y0U9eh10VBkXndIabZkaw8pVQ3Q";

export const MASTER_MESSAGING_DOC_URL = `https://docs.google.com/document/d/${MASTER_MESSAGING_DOC_ID}/edit`;

export type MessagingSection = {
  heading: string;
  body: string;
};

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  // Bullets and numbered list items are content, not section headings.
  if (/^([*\-\u2022]|\d+[.)])\s/.test(t)) return false;
  if (/[.;:!?]$/.test(t) && !/:$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 10) return false;
  // ALL CAPS, Title Case, numbered or trailing-colon lines read as headings.
  return (
    t === t.toUpperCase() ||
    /:$/.test(t) ||
    words.filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(words.length * 0.6)
  );
}

/** Splits the exported plain-text document into heading + body sections. */
export function parseMessagingSections(text: string): MessagingSection[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: MessagingSection[] = [];
  let heading = "Overview";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      heading = line.trim().replace(/:$/, "");
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections
    .filter((s) => s.body.length > 40)
    .slice(0, 24)
    .map((s) => ({ heading: s.heading, body: s.body.slice(0, 4000) }));
}
