/** Minimal CSV parser (RFC 4180 quotes). Used for roster import; values stay plain text. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Accepts "ug_number,full_name" with or without a header row. */
export function rosterRows(text: string): { ug_number: string; full_name: string }[] {
  const rows = parseCsv(text).map((r) => ({ ug_number: (r[0] ?? "").trim(), full_name: (r[1] ?? "").trim() }));
  const first = rows[0];
  if (first && /ug/i.test(first.ug_number) && /name/i.test(first.full_name)) rows.shift();
  return rows.filter((r) => r.ug_number && r.full_name);
}
