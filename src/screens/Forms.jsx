import React from 'react'
import { IconPlus, IconChevronRight } from '../components/icons'
import { loadForms } from '../lib/forms'
import { FormBuilder } from './FormBuilder'
import { SkeletonCard, EmptyState } from '../components/Loading'

// Coach hub for all forms - build, edit and review check-in / intake forms.
export function Forms({ trainerId }) {
  const [forms, setForms]   = React.useState(null);
  const [query, setQuery]   = React.useState('');
  const [builder, setBuilder] = React.useState(undefined); // undefined=closed, null=new, obj=edit

  const refresh = React.useCallback(() => { loadForms().then(setForms); }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  if (builder !== undefined) {
    return (
      <FormBuilder
        trainerId={trainerId}
        form={builder}
        onClose={() => setBuilder(undefined)}
        onSaved={(keepOpen) => { refresh(); if (!keepOpen) setBuilder(undefined); }}
      />
    );
  }

  const all = forms || [];
  const filtered = all.filter(f => f.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="scroller coach-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '8px 0 14px' }}>
        <div>
          <div className="label">// COACH</div>
          <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>FORMS</div>
        </div>
        <button onClick={() => setBuilder(null)} className="btn-primary" style={{ fontSize: 11, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus size={14}/> NEW
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search forms…"
          style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12 }}/>
      </div>

      {forms === null ? (
        <SkeletonCard rows={3} />
      ) : all.length === 0 ? (
        <EmptyState icon="Checklist" title="No forms yet"
          sub="Build check-ins, intake or feedback forms once, then assign them to any client."
          actionLabel="+ CREATE FIRST FORM" onAction={() => setBuilder(null)} />
      ) : (
        <div className="stagger-in" style={{ display: 'grid', gap: 8 }}>
          {filtered.map(f => (
            <button key={f.id} onClick={() => setBuilder(f)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
              <div className="card tappable" style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{f.title}</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 4 }}>
                    {(f.fields?.length || 0)} QUESTION{(f.fields?.length || 0) === 1 ? '' : 'S'}
                    {f.description ? ` · ${f.description.slice(0, 40)}` : ''}
                  </div>
                </div>
                <IconChevronRight size={16} style={{ color: 'var(--text-3)' }}/>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No forms match</div>}
        </div>
      )}
    </div>
  );
}
