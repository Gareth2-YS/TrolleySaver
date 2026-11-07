// The server's rule (clean_text in backend/lambdas/common/validation.py), so the form can say what's
// wrong before sending: no control characters (Unicode Cc) or invisible formatting characters (Cf),
// such as NUL, a zero-width space or a right-to-left override, which can disguise text other people
// see. Zero-width (non-)joiners are allowed because some scripts need them.
const HIDDEN = /[\p{Cc}\p{Cf}]/u
const JOINERS = /[‌‍]/

// Single-line fields collapse this whitespace into spaces, as Python's str.split does, so it isn't
// refused: tab, line feed, vertical tab, form feed, carriage return, U+001C–U+001F and U+0085.
const collapsed = (code: number) => (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x1f) || code === 0x85
// Multi-line text (reasons) keeps tabs and line breaks.
const lineBreak = (code: number) => code === 0x09 || code === 0x0a || code === 0x0d

/** True when `value` has a character the server refuses. `multiline` text may also contain line breaks. */
export function hasHiddenCharacters(value: string, multiline = false) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (JOINERS.test(char) || (multiline ? lineBreak(code) : collapsed(code))) continue
    if (HIDDEN.test(char)) return true
  }
  return false
}

export const hiddenCharactersMessage = (label: string) => `${label} can't contain hidden or control characters`
