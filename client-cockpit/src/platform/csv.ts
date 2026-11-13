const fields = [
  "recorded_at",
  "hr_bpm",
  "spo2_pct",
  "eda_tonic_us",
  "hrv_rmssd_ms",
  "sleep_duration_hr",
  "resp_rate_bpm",
  "skin_temp_c",
  "scr_peaks_min",
  "mission_day",
];
export function parseCsv(text: string): Record<string, unknown>[] {
  if (text.length > 512000) throw new Error("Maximum file size is 500 KB");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell.replace(/\r$/, ""));
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((h) => h.trim().replace(/^\uFEFF/, ""));
  if (
    !header ||
    ![
      "hr_bpm",
      "spo2_pct",
      "eda_tonic_us",
      "hrv_rmssd_ms",
      "sleep_duration_hr",
    ].every((k) => header.includes(k))
  )
    throw new Error(
      "Required columns: hr_bpm, spo2_pct, eda_tonic_us, hrv_rmssd_ms, sleep_duration_hr",
    );
  if (
    new Set(header).size !== header.length ||
    header.some((h) => !fields.includes(h))
  )
    throw new Error("Unknown or duplicate CSV columns");
  if (rows.length < 1 || rows.length > 200)
    throw new Error("Import 1–200 readings per file");
  return rows.map((r, i) => {
    if (r.length !== header.length)
      throw new Error(`Row ${i + 2}: wrong column count`);
    const result: Record<string, unknown> = {};
    header.forEach((k, j) => {
      const v = r[j].trim();
      if (!v) return;
      if (k === "recorded_at") {
        if (!Number.isFinite(Date.parse(v)))
          throw new Error(`Row ${i + 2}: invalid timestamp`);
        result[k] = new Date(v).toISOString();
      } else {
        const n = Number(v);
        if (!Number.isFinite(n))
          throw new Error(`Row ${i + 2}: ${k} must be numeric`);
        result[k] = n;
      }
    });
    return result;
  });
}
export function exportCsv(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^(?=\s*[=+@-])/, "'")
      .replaceAll('"', '""') +
    '"';
  return [keys, ...rows.map((r) => keys.map((k) => r[k]))]
    .map((row) => row.map(cell).join(","))
    .join("\n");
}
