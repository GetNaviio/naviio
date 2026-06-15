// Shared response formatter for Navi (and any other AI surface). Strips markdown
// emphasis, headers, code ticks, rules, and emojis, and normalizes spacing so
// replies read as clean, plain, well-separated text — no asterisks, no emojis.
export function cleanNaviText(input: string): string {
  if (!input) return input
  let s = input

  // Markdown horizontal rules (---, ***, ___) on their own line.
  s = s.replace(/^\s*([-*_]\s*){3,}$/gm, '')
  // ATX headers: "## Title" -> "Title"
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  // Bold / italic markers: **x**, *x*, __x__, _x_
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  // Inline code backticks
  s = s.replace(/`([^`]+)`/g, '$1')
  // Markdown bullets at line start -> indented plain bullet.
  s = s.replace(/^\s*[-*+]\s+/gm, '   • ')
  // Numbered list items -> indented.
  s = s.replace(/^\s*(\d+)\.\s+/gm, '   $1. ')
  // Strip emojis / pictographs / regional indicators / variation selectors.
  s = s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/gu, '')
  // Tidy whitespace.
  s = s.replace(/[ \t]+$/gm, '')   // trailing spaces
  s = s.replace(/\n{3,}/g, '\n\n') // collapse big gaps
  return s.trim()
}
