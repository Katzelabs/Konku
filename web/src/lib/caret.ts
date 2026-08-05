/**
 * Keeps the caret where the user left it when a save rewrites the buffer.
 *
 * Saving replaces the editor's text with the markdown the server stored, which
 * differs by the `<!-- c:xxxx -->` comments the parser appended to new card
 * lines. Setting a controlled textarea's value moves the caret to the end, so
 * an autosave firing mid-sentence would fling the cursor away — the exact kind
 * of friction that makes people stop writing things down.
 *
 * The parser only ever appends to the end of a line; it never adds, removes or
 * reorders lines. So the caret's (line, column) is stable across the rewrite,
 * which makes this exact rather than a heuristic.
 */
export function remapCaret(before: string, after: string, offset: number): number {
  const head = before.slice(0, offset)
  const line = head.split('\n').length - 1
  const column = offset - (head.lastIndexOf('\n') + 1)

  const lines = after.split('\n')
  if (line >= lines.length) return after.length

  let start = 0
  for (let i = 0; i < line; i++) start += lines[i].length + 1

  return start + Math.min(column, lines[line].length)
}
