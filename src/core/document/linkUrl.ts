/**
 * The address a link leads to, made safe and complete: only what a learner may be sent to - a page (http, https), a mail address (mailto:) or a
 * phone number (tel:). Anything else (javascript:, data:, a bare word) is not a link. An address typed without its scheme ("example.org/page")
 * becomes https. Null when there is nothing usable. player.runtime.js checks the same on its own (linkHref): keep them in step.
 */
export function safeLinkUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^(mailto:|tel:)\S+$/i.test(text)) return text;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^[^\s/]+\.[^\s/]+/.test(text) ? `https://${text}` : "";
  if (!/^https?:\/\//i.test(withScheme)) return null;
  try {
    const url = new URL(withScheme);
    return url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
