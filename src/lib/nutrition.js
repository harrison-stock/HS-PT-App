import { supabase } from './supabase'

// ── Cronometer "Daily Nutrition" CSV import ──────────────────────
// Cronometer Pro → export a client's data → "Daily Nutrition" gives one row
// per day with a Date column plus 80+ nutrient columns. We only need a few,
// and we match them by fuzzy header name so column order / exact labels
// (e.g. "Energy (kcal)" vs "Energy (KCal)") don't matter.

// Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ''));
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Find the index of the first header that includes ALL of the given tokens.
function findCol(headers, ...tokenSets) {
  for (const tokens of tokenSets) {
    const want = tokens.map(norm);
    const idx = headers.findIndex(h => { const n = norm(h); return want.every(t => n.includes(t)); });
    if (idx !== -1) return idx;
  }
  return -1;
}

// Parse a Cronometer Daily Nutrition CSV into per-day rows. Returns
// { rows: [{ log_date, energy_kcal, protein_g, carbs_g, fat_g, completed }], error }.
export function parseCronometerDaily(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'That file has no data rows.' };
  const headers = table[0];

  const iDate     = findCol(headers, ['date']);
  const iEnergy   = findCol(headers, ['energy', 'kcal'], ['energy'], ['calories']);
  const iProtein  = findCol(headers, ['protein']);
  const iCarbs    = findCol(headers, ['carbs'], ['carbohydrate']);
  const iFat      = findCol(headers, ['fat', 'g']) !== -1 ? findCol(headers, ['fat', 'g']) : findCol(headers, ['fat']);
  const iDone     = findCol(headers, ['completed']);

  if (iDate === -1 || iProtein === -1) {
    return { rows: [], error: 'This doesn’t look like a Cronometer “Daily Nutrition” export (no Date/Protein columns). Re-export and pick Daily Nutrition.' };
  }

  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; };
  const toISO = (v) => {
    const s = (v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);            // 2026-07-22
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);       // DD/MM/YYYY fallback
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const log_date = toISO(cells[iDate]);
    if (!log_date) continue;
    const doneRaw = iDone !== -1 ? norm(cells[iDone]) : '';
    rows.push({
      log_date,
      energy_kcal: iEnergy  !== -1 ? num(cells[iEnergy])  : null,
      protein_g:   iProtein !== -1 ? num(cells[iProtein]) : null,
      carbs_g:     iCarbs   !== -1 ? num(cells[iCarbs])   : null,
      fat_g:       iFat     !== -1 ? num(cells[iFat])     : null,
      completed:   doneRaw === 'true' || doneRaw === 'yes' || doneRaw === '1',
    });
  }
  if (!rows.length) return { rows: [], error: 'No dated rows found in that file.' };
  return { rows, error: null };
}

// Upsert parsed rows for a client (overwrites same-day entries).
export async function saveNutritionLogs(clientId, rows) {
  if (!rows?.length) return { count: 0 };
  const payload = rows.map(r => ({ ...r, client_id: clientId, source: 'cronometer', updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('nutrition_logs').upsert(payload, { onConflict: 'client_id,log_date' });
  return { count: error ? 0 : rows.length, error };
}

// Load the last `days` of nutrition and roll up a summary for the panels.
export async function loadNutritionSummary(clientId, days = 56, proteinTarget = null) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('nutrition_logs')
    .select('log_date, energy_kcal, protein_g, carbs_g, fat_g, completed')
    .eq('client_id', clientId)
    .gte('log_date', since)
    .order('log_date', { ascending: true });
  if (error) return null;
  const rows = data || [];
  if (!rows.length) return { rows: [], loggedDays: 0, lastDate: null, avgProtein: null, avgKcal: null, proteinAdherence: null, daysSince: null };

  const logged = rows.filter(r => r.protein_g != null || r.energy_kcal != null);
  const last14 = logged.filter(r => r.log_date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const avg = (arr, k) => arr.length ? Math.round(arr.reduce((n, r) => n + (r[k] || 0), 0) / arr.length) : null;

  const lastDate = logged.length ? logged[logged.length - 1].log_date : null;
  const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate + 'T00:00:00Z').getTime()) / 86400000) : null;

  // Protein adherence over the last 14 logged days: share of days hitting target.
  let proteinAdherence = null;
  if (proteinTarget && last14.length) {
    const hit = last14.filter(r => (r.protein_g || 0) >= proteinTarget * 0.9).length; // within 10%
    proteinAdherence = Math.round((hit / last14.length) * 100);
  }

  return {
    rows, loggedDays: logged.length, lastDate, daysSince,
    avgProtein: avg(last14, 'protein_g'),
    avgKcal: avg(last14, 'energy_kcal'),
    proteinAdherence,
  };
}

// Lightweight "days since last nutrition log" for the coach roster/digest.
export async function loadLastNutritionDays(clientIds) {
  if (!clientIds?.length) return {};
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase.from('nutrition_logs')
    .select('client_id, log_date')
    .in('client_id', clientIds)
    .gte('log_date', since)
    .order('log_date', { ascending: false });
  const out = {};
  (data || []).forEach(r => {
    if (out[r.client_id] == null) {
      out[r.client_id] = Math.floor((Date.now() - new Date(r.log_date + 'T00:00:00Z').getTime()) / 86400000);
    }
  });
  return out;
}
