/**
 * Blanks out comments, strings and quoted names (same length), so keywords and brackets can be found by position.
 * One left-to-right pass, so a comment marker inside a string (or a quote inside a comment) is read correctly.
 */
export function mask(sql) {
  let out = "", i = 0;
  while (i < sql.length) {
    const ch = sql[i], two = sql.slice(i, i + 2);
    let end = -1;
    if (two === "--") { end = sql.indexOf("\n", i); if (end < 0) end = sql.length; }
    else if (two === "/*") { end = sql.indexOf("*/", i + 2); end = end < 0 ? sql.length : end + 2; }
    else if (ch === "'" || ch === '"' || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      for (;;) {
        j = sql.indexOf(close, j);
        if (j < 0) { j = sql.length; break; }
        if (sql[j + 1] === close) { j += 2; continue; } // '' or ]] inside
        j += 1; break;
      }
      end = j;
    }
    if (end >= 0) { out += " ".repeat(end - i); i = end; } else { out += ch; i++; }
  }
  return out;
}
