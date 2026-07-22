/**
 * Minimal markdown renderer — supports headers, bold, italic, lists, code, line breaks.
 * Safe: escapes HTML first, then applies markdown patterns.
 */
function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first
  let html = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (inline)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => "<ul>" + m + "</ul>");

  // Paragraph breaks (double newline)
  html = html.split(/\n\n+/).map(p => {
    if (p.trim().startsWith("<")) return p;
    return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
  }).join("");

  return html;
}