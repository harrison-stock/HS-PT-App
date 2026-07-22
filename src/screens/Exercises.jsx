import React from 'react'
import { Hex } from '../components/hex'
import { IconPlus, IconPlay, IconChevronRight } from '../components/icons'
import { loadExercises, videoThumb, MODALITIES } from '../lib/exercises'
import { exerciseMatches } from '../lib/exerciseSearch'
import { ExerciseBuilder } from './ExerciseBuilder'
import { SkeletonCard, EmptyState } from '../components/Loading'

const MOD_COLOR = {
  Strength: 'var(--accent)', Cardio: 'var(--c-coral)', Mobility: 'var(--accent-2)',
  Plyometric: 'var(--c-amber)', Olympic: 'var(--c-blue)', Bodyweight: 'var(--purple)',
};

// Coach master list of exercises (replaces the coach Profile tab).
export function Exercises({ trainerId }) {
  const [list, setList]     = React.useState(null);
  const [query, setQuery]   = React.useState('');
  const [modFilter, setMod] = React.useState('ALL');
  const [builder, setBuilder] = React.useState(undefined); // undefined=closed, null=new, obj=edit

  const refresh = React.useCallback(() => { loadExercises().then(setList); }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  if (builder !== undefined) {
    return (
      <ExerciseBuilder
        trainerId={trainerId}
        exercise={builder}
        onClose={() => setBuilder(undefined)}
        onSaved={(keepOpen) => { refresh(); if (!keepOpen) setBuilder(undefined); }}
      />
    );
  }

  const all = list || [];
  const filtered = all.filter(e =>
    (modFilter === 'ALL' || e.modality === modFilter) &&
    exerciseMatches(e.name, query, e.muscle_group || ''));

  return (
    <div className="scroller coach-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '8px 0 14px' }}>
        <div>
          <div className="label">// LIBRARY</div>
          <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>EXERCISES</div>
        </div>
        <button onClick={() => setBuilder(null)} className="btn-primary" style={{ fontSize: 11, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus size={14}/> NEW
        </button>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search… (try BB, DB, BW)"
          style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12 }}/>
      </div>

      {/* Modality filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
        {['ALL', ...MODALITIES].map(m => (
          <button key={m} onClick={() => setMod(m)} className="mono" style={{
            all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            background: modFilter === m ? 'var(--accent-soft)' : 'var(--bg-2)',
            border: `1px solid ${modFilter === m ? 'var(--accent)' : 'var(--line)'}`,
            color: modFilter === m ? 'var(--accent)' : 'var(--text-3)',
          }}>{m.toUpperCase()}</button>
        ))}
      </div>

      {list === null ? (
        <SkeletonCard rows={4} />
      ) : all.length === 0 ? (
        <EmptyState icon="Dumbbell" title="No exercises yet"
          sub="Build your reusable library - every exercise you add is available in the programme builder."
          actionLabel="+ CREATE FIRST EXERCISE" onAction={() => setBuilder(null)} />
      ) : (
        <div className="stagger-in" style={{ display: 'grid', gap: 8 }}>
          {filtered.map(e => <ExerciseRow key={e.id} e={e} onOpen={() => setBuilder(e)} />)}
          {filtered.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No exercises match</div>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ e, onOpen }) {
  const thumb = e.thumbnail_url || videoThumb(e.video_url) || (e.photos && e.photos[0]);
  const col = MOD_COLOR[e.modality] || 'var(--accent)';
  return (
    <button onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div className="card tappable" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'stretch', borderLeft: `2px solid ${col}` }}>
        <div style={{ width: 72, flexShrink: 0, position: 'relative', background: thumb ? `url('${thumb}') center/cover` : 'var(--bg-3)' }}>
          {(e.video_url) && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#eceff4' }}><IconPlay size={16}/></div>
          )}
        </div>
        <div style={{ padding: 12, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: col }}>{(e.modality || '').toUpperCase()}</span>
              {e.muscle_group ? ` · ${e.muscle_group.toUpperCase()}` : ''}
              {e.tracking_fields?.length ? ` · ${e.tracking_fields.join('/')}` : ''}
            </div>
          </div>
          <IconChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }}/>
        </div>
      </div>
    </button>
  );
}
