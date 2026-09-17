import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes HTML content and applies styling to mention spans.
 * Uses DOMPurify to prevent XSS attacks from user-generated comment content.
 */
export function sanitizeAndStyleComment(comment: string): string {
  // Configure DOMPurify to allow safe HTML elements and attributes for email rendering
  const sanitized = DOMPurify.sanitize(comment, {
    ALLOWED_TAGS: ['span', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a'],
    ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel'],
  });

  // Apply styling to mention spans after sanitization
  return sanitized.replace(
    /<span class="mention[^"]*"/g,
    '<span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 2px 10px; font-size: 15px; font-weight: 500; margin-right: 4px; background-color: #3A2FA915; color: #3A2FA9;"',
  );
}
