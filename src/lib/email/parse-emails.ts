/** Email addresses found in pasted text: one per line, or separated by commas, semicolons or spaces. */
export function parseEmails(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && out.indexOf(email) === -1) out.push(email);
  }
  return out;
}
