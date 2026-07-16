import React from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV, parseDateLoose } from '../lib/csv'
import { LoadingTile } from '../components/Loading'
import { toast } from '../lib/toast'
import { HexBackButton } from '../components/hex'
import { IconX2, IconCheck } from '../components/icons'

// Fields we can import into. `key` maps to how it's used below.
const FIELDS = [
  { key: 'date',     label: 'Date',        required: true,  hints: ['date', 'day', 'completed', 'workout date', 'logged'] },
  { key: 'exercise', label: 'Exercise',    required: true,  hints: ['exercise', 'movement', 'name'] },
  { key: 'reps',     label: 'Reps',        required: false, hints: ['rep', 'reps'] },
  { key: 'weight',   label: 'Weight',      required: false, hints: ['weight', 'kg', 'lbs', 'lb', 'load'] },
  { key: 'rpe',      label: 'RPE (1–10)',  required: false, hints: ['rpe', 'intensity', 'effort'] },
  { key: 'set',      label: 'Set #',       required: false, hints: ['set', 'set number', 'set no'] },
];

const guessColumn = (headers, hints) => {
  const lower = headers.map(h => h.toLowerCase());
  for (const hint of hints) { const i = lower.findIndex(h => h === hint); if (i >= 0) return headers[i]; }
  for (const hint of hints) { const i = lower.findIndex(h => h.includes(hint)); if (i >= 0) return headers[i]; }
  return '';
};

export function ImportHistory({ clientId, clientName, trainerId, onClose, onImported }) {
  const [parsed, setParsed]   = React.useState(null); // { headers, rows }
  const [map, setMap]         = React.useState({});
  const [unit, setUnit]       = React.useState('kg');
  const [busy, setBusy]       = React.useState(false);
  const [error, setError]     = React.useState('');
  const fileRef = React.useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setError('');
    try {
      const text = await f.text();
      const p = parseCSV(text);
      if (!p.headers.length || !p.rows.length) { setError('That file has no rows I can read.'); return; }
      setParsed(p);
      const g = {}; FIELDS.forEach(fl => { g[fl.key] = guessColumn(p.headers, fl.hints); });
      setMap(g);
      // Auto-detect lb if a weight header mentions it.
      if (/lb/i.test(g.weight || '')) setUnit('lb');
    } catch (err) { setError('Could not read that file.'); }
  };

  // Build clean, mapped entries (only rows with a valid date + exercise).
  const entries = React.useMemo(() => {
    if (!parsed) return [];
    const out = [];
    for (const r of parsed.rows) {
      const date = parseDateLoose(r[map.date]);
      const exercise = (r[map.exercise] || '').trim();
      if (!date || !exercise) continue;
      const repsRaw = map.reps ? parseInt(r[map.reps]) : null;
      let weight = map.weight ? parseFloat(String(r[map.weight]).replace(/[^\d.]/g, '')) : null;
      if (weight != null && !isNaN(weight) && unit === 'lb') weight = Math.round(weight * 0.45359237 * 100) / 100;
      let rpe = map.rpe ? parseInt(r[map.rpe]) : null;
      if (rpe != null && (isNaN(rpe) || rpe < 1 || rpe > 10)) rpe = null;
      out.push({
        date, exercise,
        reps: repsRaw != null && !isNaN(repsRaw) ? repsRaw : null,
        weight: weight != null && !isNaN(weight) ? weight : null,
        rpe,
      });
    }
    return out;
  }, [parsed, map, unit]);

  const canImport = !!map.date && !!map.exercise && entries.length > 0;

  const runImport = async () => {
    if (!canImport || busy) return;
    setBusy(true);
    try {
      // Group by date → one session per date.
      const byDate = new Map();
      entries.forEach(e => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });

      let sessions = 0, sets = 0;
      for (const [date, rows] of byDate) {
        const ts = `${date}T12:00:00`;
        const { data: sess, error: sErr } = await supabase.from('workout_sessions')
          .insert({ client_id: clientId, day_id: null, source: 'import', started_at: ts, completed_at: ts })
          .select('id').single();
        if (sErr || !sess) throw new Error(sErr?.message || 'Could not create session');
        sessions++;
        const perExercise = {};
        const logRows = rows.map(e => {
          perExercise[e.exercise] = (perExercise[e.exercise] || 0);
          const idx = perExercise[e.exercise]++;
          return {
            session_id: sess.id, exercise_id: null, exercise_name: e.exercise,
            set_index: idx, actual_reps: e.reps, actual_weight_kg: e.weight,
            actual_time_secs: null, intensity: e.rpe,
          };
        });
        if (logRows.length) {
          const { error: lErr } = await supabase.from('logged_sets').insert(logRows);
          if (lErr) throw new Error(lErr.message);
          sets += logRows.length;
        }
      }
      toast(`Imported ${sessions} session${sessions === 1 ? '' : 's'} · ${sets} sets`);
      onImported?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Import failed.');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">// IMPORT HISTORY</div>
          <div className="h-bold" style={{ fontSize: 15, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(clientName || 'CLIENT').toUpperCase()}</div>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '16px 16px 40px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {!parsed ? (
          <div className="card" style={{ padding: 22, textAlign: 'center', display: 'grid', gap: 14 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.7 }}>
              Upload a CSV of past workouts (e.g. an Everfit history export).<br/>
              <span style={{ color: 'var(--text-3)', fontSize: 10 }}>One row per logged set works best — a Date and Exercise column are required.</span>
            </div>
            <button onClick={() => fileRef.current?.click()} className="btn-primary" style={{ width: '100%' }}>CHOOSE CSV FILE</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{parsed.rows.length} ROWS · {parsed.headers.length} COLUMNS</div>
              <button onClick={() => { setParsed(null); setError(''); }} className="mono" style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--accent)' }}>CHANGE FILE</button>
            </div>

            {/* Column mapping */}
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="label">// MAP YOUR COLUMNS</div>
              {FIELDS.map(fl => (
                <div key={fl.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 12 }}>{fl.label}{fl.required && <span style={{ color: 'var(--c-coral)' }}> *</span>}</div>
                  <select value={map[fl.key] || ''} onChange={e => setMap(m => ({ ...m, [fl.key]: e.target.value }))} style={selSt}>
                    <option value="">— none —</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 12 }}>Weight unit</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['kg', 'lb'].map(u => (
                    <button key={u} onClick={() => setUnit(u)} className="mono" style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: unit === u ? 'var(--accent-soft)' : 'var(--bg-3)', border: `1px solid ${unit === u ? 'var(--accent)' : 'var(--line)'}`,
                      color: unit === u ? 'var(--accent)' : 'var(--text-3)',
                    }}>{u.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="label">// PREVIEW · {entries.length} VALID ROWS</div>
              {entries.length === 0 ? (
                <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>No rows have both a readable date and an exercise — check the Date/Exercise mapping.</div>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 44px 52px 36px', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--line)' }} className="mono">
                    {['DATE', 'EXERCISE', 'REPS', 'KG', 'RPE'].map(h => <span key={h} style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{h}</span>)}
                  </div>
                  {entries.slice(0, 6).map((e, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 44px 52px 36px', gap: 6, padding: '7px 12px', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 11 }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{e.date.slice(5)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.exercise}</span>
                      <span className="mono">{e.reps ?? '—'}</span>
                      <span className="mono">{e.weight ?? '—'}</span>
                      <span className="mono">{e.rpe ?? '—'}</span>
                    </div>
                  ))}
                  {entries.length > 6 && <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', padding: '8px 12px', borderTop: '1px solid var(--line)' }}>+{entries.length - 6} more…</div>}
                </div>
              )}
            </div>

            {error && <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', lineHeight: 1.5 }}>✕ {error}</div>}

            <button onClick={runImport} disabled={!canImport || busy} className="btn-primary"
              style={{ width: '100%', opacity: canImport && !busy ? 1 : 0.4, pointerEvents: canImport && !busy ? 'auto' : 'none' }}>
              <IconCheck size={13} sw={3}/> IMPORT {entries.length} SET{entries.length === 1 ? '' : 'S'} →
            </button>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
              Creates one completed session per date. Imported sessions are tagged so they can be identified later.
            </div>
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
