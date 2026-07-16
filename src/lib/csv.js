// Minimal, dependency-free CSV parser. Handles quoted fields, escaped quotes
// ("" inside quotes), commas and newlines inside quotes, and CRLF/LF.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '').replace(/^﻿/, ''); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      // Skip fully-empty lines
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
  return { headers, rows: data };
}

// Best-effort date parse → 'YYYY-MM-DD' (or null). Handles ISO, DD/MM/YYYY,
// MM/DD/YYYY (ambiguous days default to DD/MM), and "12 Jul 2026".
export function parseDateLoose(v) {
  const str = String(v || '').trim();
  if (!str) return null;
  let m;
  if ((m = str.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) {
    let [_, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // Prefer DD/MM; fall back to MM/DD if first part can't be a day.
    let d = +a, mo = +b;
    if (d > 31 || mo > 12) { d = +b; mo = +a; }
    if (mo > 12) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const t = Date.parse(str);
  if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  return null;
}
