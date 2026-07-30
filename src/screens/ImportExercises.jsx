import React from 'react'
import { parseCSV } from '../lib/csv'
import { LoadingTile } from '../components/Loading'
import { toast } from '../lib/toast'
import { HexBackButton } from '../components/hex'
import { IconCheck } from '../components/icons'
import { guessSplit } from '../lib/loadSplit'
import {
  MODALITIES, MUSCLE_GROUPS, MOVEMENT_PATTERNS, CATEGORIES, TRACKING_OPTIONS,
  importExercises, updateExercises, matchOption, matchMuscles, parseBool, splitList, videoThumb,
} from '../lib/exercises'

// Columns we can read. Only NAME is required - everything else falls back to
// the same defaults the builder uses for a new exercise, so a two-column
// "name, video" sheet is a perfectly valid import.
const FIELDS = [
  { key: 'name',      label: 'Name',              required: true,  hints: ['name', 'exercise', 'movement', 'title'] },
  { key: 'video',     label: 'Video URL',         required: false, hints: ['video', 'youtube', 'url', 'link', 'demo'] },
  { key: 'modality',  label: 'Modality',          required: false, hints: ['modality', 'type', 'discipline'] },
  { key: 'muscle',    label: 'Muscle group',      required: false, hints: ['muscle group', 'muscle', 'bodypart', 'body part', 'region'] },
  { key: 'pattern',   label: 'Movement pattern',  required: false, hints: ['pattern', 'movement pattern', 'movement'] },
  { key: 'category',  label: 'Category',          required: false, hints: ['category', 'kind'] },
  { key: 'tracking',  label: 'Tracking fields',   required: false, hints: ['tracking', 'track', 'fields', 'metrics'] },
  { key: 'muscles',   label: 'Muscles worked',    required: false, hints: ['muscles worked', 'muscles', 'targets', 'secondary'] },
  { key: 'cues',      label: 'Instructions/cues', required: false, hints: ['instruction', 'cue', 'notes', 'description', 'coaching'] },
  { key: 'link',      label: 'Reference link',    required: false, hints: ['reference', 'article', 'source', 'link url'] },
  { key: 'banded',    label: 'Banded (y/n)',      required: false, hints: ['banded', 'band'] },
  { key: 'unilateral',label: 'Each side (y/n)',   required: false, hints: ['unilateral', 'each side', 'single side', 'per side'] },
  { key: 'twoweights',label: 'Two weights (y/n)',  required: false, hints: ['two weights', 'pair', 'per hand', 'each hand', 'split'] },
];

const DEFAULTS = {
  modality: 'Strength',
  muscle_group: 'Shoulders',
  movement_pattern: 'Upper Body Vertical Push',
  category: 'Strength',
  tracking_fields: ['Weight', 'Reps'],
};

const guessColumn = (headers, hints) => {
  const lower = headers.map(h => h.toLowerCase());
  for (const hint of hints) { const i = lower.findIndex(h => h === hint); if (i >= 0) return headers[i]; }
  for (const hint of hints) { const i = lower.findIndex(h => h.includes(hint)); if (i >= 0) return headers[i]; }
  return '';
};

const key = (s) => String(s || '').trim().toLowerCase();

// Paste a sheet straight out of Excel/Numbers/Sheets and you get tabs, not
// commas. Convert so the same parser handles both.
const normaliseDelimiters = (text) =>
  text.includes('\t') && !text.includes(',') ? text.replace(/\t/g, ',') : text;

export function ImportExercises({ trainerId, existing = [], onClose, onImported }) {
  const [parsed, setParsed] = React.useState(null);
  const [map, setMap]       = React.useState({});
  const [dupMode, setDup]   = React.useState('skip'); // 'skip' | 'update'
  const [busy, setBusy]     = React.useState(false);
  const [error, setError]   = React.useState('');
  const fileRef = React.useRef(null);

  // Existing library names, so we can flag collisions before writing anything.
  const byName = React.useMemo(() => {
    const m = new Map();
    (existing || []).forEach(e => { const k = key(e.name); if (k && !m.has(k)) m.set(k, e); });
    return m;
  }, [existing]);

  const readText = (text) => {
    const p = parseCSV(normaliseDelimiters(text));
    if (!p.headers.length || !p.rows.length) { setError('That file has no rows I can read.'); return; }
    setError('');
    setParsed(p);
    const g = {}; FIELDS.forEach(f => { g[f.key] = guessColumn(p.headers, f.hints); });
    setMap(g);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { readText(await f.text()); } catch (err) { setError('Could not read that file.'); }
  };

  const onPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setError('Clipboard is empty.'); return; }
      readText(text);
    } catch (err) {
      setError('Could not read the clipboard - use the file picker instead.');
    }
  };

  // Turn mapped rows into full exercise drafts, tagging each as new or a
  // collision with something already in the library.
  const entries = React.useMemo(() => {
    if (!parsed) return [];
    const out = [];
    const seen = new Set(); // duplicates *within* the file itself
    for (const r of parsed.rows) {
      const name = (r[map.name] || '').trim();
      if (!name) continue;
      const k = key(name);
      if (seen.has(k)) continue;
      seen.add(k);

      const tracking = map.tracking
        ? splitList(r[map.tracking]).map(t => matchOption(t, TRACKING_OPTIONS, '')).filter(Boolean)
        : [];

      out.push({
        name,
        video_url: (r[map.video] || '').trim(),
        thumbnail_url: '',
        modality: matchOption(r[map.modality], MODALITIES, DEFAULTS.modality),
        muscle_group: matchOption(r[map.muscle], MUSCLE_GROUPS, DEFAULTS.muscle_group),
        movement_pattern: matchOption(r[map.pattern], MOVEMENT_PATTERNS, DEFAULTS.movement_pattern),
        category: matchOption(r[map.category], CATEGORIES, DEFAULTS.category),
        tracking_fields: tracking.length ? tracking : DEFAULTS.tracking_fields,
        muscles_worked: map.muscles ? matchMuscles(r[map.muscles]) : [],
        instructions: (r[map.cues] || '').trim(),
        link_url: (r[map.link] || '').trim(),
        banded: parseBool(r[map.banded]),
        unilateral: parseBool(r[map.unilateral]),
        // No column? Infer from the name - "DB Bench Press" is a pair by
        // default, and a wrong guess is one tap to fix in the builder.
        load_split: map.twoweights
          ? (parseBool(r[map.twoweights]) ? 2 : 1)
          : guessSplit(name),
        existing: byName.get(k) || null,
      });
    }
    return out;
  }, [parsed, map, byName]);

  const fresh = entries.filter(e => !e.existing);
  const dupes = entries.filter(e => e.existing);
  const willWrite = dupMode === 'update' ? entries.length : fresh.length;
  const canImport = !!map.name && willWrite > 0;

  const runImport = async () => {
    if (!canImport || busy) return;
    setBusy(true);
    setError('');
    try {
      const { inserted, error: insErr } = await importExercises(trainerId, fresh);
      if (insErr) throw new Error(insErr.message);

      let updated = 0;
      if (dupMode === 'update' && dupes.length) {
        // Only touch columns the sheet actually has. Patching every field meant
        // a two-column "name + video" sheet - the obvious way to add demo clips
        // to an existing library - silently overwrote muscle group, category
        // and coaching notes with the defaults for every row it matched.
        const res = await updateExercises(dupes.map(d => {
          const patch = {};
          if (map.video)      patch.video_url        = d.video_url;
          if (map.modality)   patch.modality         = d.modality;
          if (map.muscle)     patch.muscle_group     = d.muscle_group;
          if (map.pattern)    patch.movement_pattern = d.movement_pattern;
          if (map.category)   patch.category         = d.category;
          if (map.tracking)   patch.tracking_fields  = d.tracking_fields;
          if (map.muscles)    patch.muscles_worked   = d.muscles_worked;
          if (map.cues)       patch.instructions     = d.instructions;
          if (map.link)       patch.link_url         = d.link_url;
          if (map.banded)     patch.banded           = d.banded;
          if (map.unilateral) patch.unilateral       = d.unilateral;
          // Never from the name guess on an update - that would undo a
          // deliberate toggle the coach set in the builder.
          if (map.twoweights) patch.load_split       = d.load_split;
          return { id: d.existing.id, patch };
        }));
        if (res.error) throw new Error(res.error.message);
        updated = res.updated;
      }

      toast(`Imported ${inserted} exercise${inserted === 1 ? '' : 's'}${updated ? ` · ${updated} updated` : ''}`);
      onImported?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Import failed.');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', paddingTop: 'calc(var(--safe-top) + 10px)', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">// BULK IMPORT</div>
          <div className="h-bold" style={{ fontSize: 15, marginTop: 2 }}>EXERCISE LIBRARY</div>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, minHeight: 0, height: 'auto', padding: '16px 16px 40px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {!parsed ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="card" style={{ padding: 22, textAlign: 'center', display: 'grid', gap: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.7 }}>
                Build your library in a spreadsheet and bring the whole thing in at once.<br/>
                <span style={{ color: 'var(--text-3)', fontSize: 10 }}>Only a Name column is required. Anything you leave out falls back to the builder's defaults.</span>
              </div>
              <button onClick={() => fileRef.current?.click()} className="btn-primary" style={{ width: '100%' }}>CHOOSE CSV FILE</button>
              <button onClick={onPaste} className="btn-ghost" style={{ width: '100%' }}>PASTE FROM CLIPBOARD</button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onFile} style={{ display: 'none' }} />
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>// COLUMNS I UNDERSTAND</div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', lineHeight: 1.9 }}>
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <span style={{ color: f.required ? 'var(--accent)' : 'var(--text-2)' }}>{f.label}</span>
                    {f.required ? ' (required)' : ''}
                  </div>
                ))}
              </div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', lineHeight: 1.7, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                Headers are matched automatically and you can correct them after upload. Multi-value cells (tracking fields, muscles worked) can be separated by commas, semicolons, slashes or pipes. YouTube thumbnails are generated from the video URL, so there's no thumbnail column to fill in.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{parsed.rows.length} ROWS · {parsed.headers.length} COLUMNS</div>
              <button onClick={() => { setParsed(null); setError(''); }} className="mono" style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--accent)' }}>CHANGE FILE</button>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div className="label">// MAP YOUR COLUMNS</div>
              {FIELDS.map(f => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 12 }}>{f.label}{f.required && <span style={{ color: 'var(--c-coral)' }}> *</span>}</div>
                  <select value={map[f.key] || ''} onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value }))} style={selSt}>
                    <option value="">- none -</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {dupes.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="label">// {dupes.length} ALREADY IN YOUR LIBRARY</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['skip', 'SKIP THEM'], ['update', 'OVERWRITE THEM']].map(([v, lbl]) => (
                    <button key={v} onClick={() => setDup(v)} className="mono" style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      background: dupMode === v ? 'var(--accent-soft)' : 'var(--bg-3)',
                      border: `1px solid ${dupMode === v ? 'var(--accent)' : 'var(--line)'}`,
                      color: dupMode === v ? 'var(--accent)' : 'var(--text-3)',
                    }}>{lbl}</button>
                  ))}
                </div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  Matched on name. Overwriting only touches the columns your sheet has, so a name + video sheet adds clips without disturbing anything else.
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="label">// PREVIEW · {fresh.length} NEW{dupes.length ? ` · ${dupes.length} EXISTING` : ''}</div>
              {entries.length === 0 ? (
                <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>No rows have a name - check the Name mapping.</div>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {entries.slice(0, 8).map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                      <div style={{
                        width: 40, height: 23, borderRadius: 4, flexShrink: 0, border: '1px solid var(--line)',
                        background: videoThumb(e.video_url) ? `url('${videoThumb(e.video_url)}') center/cover` : 'var(--bg-3)',
                      }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                        <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.modality.toUpperCase()} · {e.muscle_group.toUpperCase()} · {e.tracking_fields.join('/')}
                        </div>
                      </div>
                      {e.existing && (
                        <span className="mono" style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--c-amber)', flexShrink: 0 }}>EXISTS</span>
                      )}
                    </div>
                  ))}
                  {entries.length > 8 && <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', padding: '8px 12px', borderTop: '1px solid var(--line)' }}>+{entries.length - 8} more…</div>}
                </div>
              )}
            </div>

            {error && <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', lineHeight: 1.5 }}>✕ {error}</div>}

            <button onClick={runImport} disabled={!canImport || busy} className="btn-primary"
              style={{ width: '100%', opacity: canImport && !busy ? 1 : 0.4, pointerEvents: canImport && !busy ? 'auto' : 'none' }}>
              <IconCheck size={13} sw={3}/> IMPORT {willWrite} EXERCISE{willWrite === 1 ? '' : 'S'} →
            </button>
          </div>
        )}
        {error && !parsed && <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', marginTop: 12, textAlign: 'center' }}>✕ {error}</div>}
      </div>

      {busy && <LoadingTile label="Importing…" variant="hex" />}
    </div>
  );
}

const selSt = {
  width: '100%', boxSizing: 'border-box', appearance: 'auto',
  background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '9px 10px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12,
};
