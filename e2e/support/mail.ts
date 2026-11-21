/** Mailpit, the dev stack's mail catcher (http://localhost:8025 unless E2E_MAILPIT_URL says otherwise). */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

export interface Mail {
  id: string;
  subject: string;
  text: string;
}

/** Every message sent to `address`, oldest first. */
export async function mailTo(address: string): Promise<Mail[]> {
  const found = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  if (!found.ok) throw new Error(`Mailpit search failed: ${found.status}`);
  const { messages } = (await found.json()) as { messages: { ID: string; Subject: string }[] };
  const mails = await Promise.all(
    messages.map(async (m) => {
      const full = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`);
      const body = (await full.json()) as { Text: string };
      return { id: m.ID, subject: m.Subject, text: body.Text };
    }),
  );
  return mails.reverse();
}

/**
 * The path and query of the first `pathPrefix` link in a mail. The origin in an email is the
 * production storefront URL, not the stack under test, so only the path is kept.
 */
export function linkIn(mail: Mail, pathPrefix: string): string {
  const match = mail.text.match(new RegExp(`https?://[^/\\s]+(${pathPrefix}[^\\s>"]*)`));
  if (!match?.[1]) throw new Error(`no ${pathPrefix} link in "${mail.subject}":\n${mail.text}`);
  return match[1];
}
