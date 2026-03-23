// =====================================================
// LinkedBridge — Text Sanitizer (Stored XSS Prevention)
// =====================================================
// Zero-dependency HTML/script sanitizer for user-generated
// content coming from external APIs.
//
// INFOSEC: LinkedIn post text may contain HTML tags or
// injected scripts. We strip ALL HTML before persisting
// so that portfolio sites consuming our API cannot be
// victims of Stored XSS attacks.
//
// This is a DEFENSE-IN-DEPTH measure. Consumers of the
// API should also sanitize on their end, but we minimize
// the attack surface at the source.
// =====================================================

/**
 * Strips ALL HTML tags from a string.
 * Uses a regex that matches opening/closing/self-closing tags
 * including attributes.
 *
 * Additionally removes:
 * - <script>...</script> blocks (including content)
 * - <style>...</style> blocks (including content)
 * - HTML comments
 * - Event handlers (onerror, onclick, etc. — redundant after strip, but defense-in-depth)
 *
 * @param input - Raw string potentially containing HTML
 * @returns Sanitized plain text
 */
export function stripHtml(input: string): string {
  return input
    // Remove <script>...</script> blocks (including content, case-insensitive, multiline)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove <style>...</style> blocks (including content)
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse multiple whitespace into single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitizes a URL to prevent javascript: protocol attacks.
 *
 * @param url - Raw URL string
 * @returns The URL if safe, or undefined if malicious
 */
export function sanitizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const trimmed = url.trim().toLowerCase();

  // Block dangerous URL protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return undefined;
  }

  // Only allow http(s) URLs
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return undefined;
  }

  return url.trim();
}
