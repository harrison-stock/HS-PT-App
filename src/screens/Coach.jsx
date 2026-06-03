import React from 'react'
import { supabase } from '../lib/supabase'
import { COACH_CLIENTS, COACH_INBOX, COACH_KPIS, COACH_SCHEDULE } from '../data/index'
import { Hex, HexBackButton } from '../components/hex'
import { IconBell, IconBolt, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconMore, IconUser } from '../components/icons'
import { ProgrammeBuilder } from './ProgrammeBuilder'

const CLIENT_ACCENTS = ['#46BBC0','#189CAA','#F39E1F','#EE6A6A','#3F84D9','#E0A5BB','#8086A3'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export function Coach({ go, trainerId }) {
  const [tab, setTab]                       = React.useState('clients');
  const [clientId, setClientId]             = React.useState(null);
  const [programmeId, setProgrammeId]       = React.useState(null);
  const [builderProgramme, setBuilderProgramme] = React.useState(null);
  const [builderOpenRoadmap, setBuilderOpenRoadmap] = React.useState(false);
  const [programmes, setProgrammes]         = React.useState([]);
  const [loadingProgs, setLoadingProgs]     = React.useState(true);
  const [clients, setClients]               = React.useState([]);
  const [loadingClients, setLoadingClients] = React.useState(true);
  const [inviteOpen, setInviteOpen]         = React.useState(false);

  React.useEffect(() => {
    fetchProgrammes();
    fetchClients();
  }, []);

  const fetchProgrammes = async () => {
    setLoadingProgs(true);
    const { data } = await supabase
      .from('programmes')
      .select('*, programme_phases(*)')
      .order('updated_at', { ascending: false });
    if (data) setProgrammes(data.map(shapeProgramme));
    setLoadingProgs(false);
  };

  const fetchClients = async () => {
    setLoadingClients(true);
    const [{ data: profiles }, { data: invites }] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('trainer_id', trainerId).eq('role', 'client'),
      supabase.from('invites').select('id, client_name, client_email, code').eq('trainer_id', trainerId).is('claimed_by', null),
    ]);
    const real    = (profiles || []).map(shapeClient);
    const pending = (invites  || []).map(inv => shapePendingClient(inv, trainerId));
    setClients([...real, ...pending]);
    setLoadingClients(false);
  };

  const newProgramme = () => {
    setBuilderOpenRoadmap(true);
    setBuilderProgramme({
      id: null,
      name: 'New Programme', tag: 'STRENGTH',
      weeks: 4, phases: 1, clients: 0,
      lastEdited: 'new',
      phaseList: [{ id: null, name: 'Phase 1', focus: 'Foundation', weeks: 4 }],
    });
  };

  const openBuilder = (prog) => { setProgrammeId(null); setBuilderOpenRoadmap(false); setBuilderProgramme(prog); };
  const closeBuilder = () => { setBuilderProgramme(null); fetchProgrammes(); };

  const duplicateProgramme = async (prog) => {
    const { data: newProg } = await supabase
      .from('programmes')
      .insert({ trainer_id: trainerId, name: prog.name + ' (Copy)', tag: prog.tag })
      .select('id').single();
    if (!newProg) return;

    for (let pi = 0; pi < prog.phaseList.length; pi++) {
      const ph = prog.phaseList[pi];
      const { data: newPhase } = await supabase
        .from('programme_phases')
        .insert({ programme_id: newProg.id, phase_index: pi, name: ph.name, focus: ph.focus, weeks: ph.weeks })
        .select('id').single();
      if (!newPhase) continue;

      const { data: days } = await supabase
        .from('programme_days')
        .select('*, workout_sections(*, section_exercises(*, exercise_sets(*)))')
        .eq('phase_id', ph.id);

      for (const day of (days || [])) {
        const { data: newDay } = await supabase
          .from('programme_days')
          .insert({ phase_id: newPhase.id, week_index: day.week_index, day_of_week: day.day_of_week, intro: day.intro || '', notes: day.notes || '' })
          .select('id').single();
        if (!newDay) continue;

        const sections = [...(day.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);
        for (const sec of sections) {
          const { data: newSec } = await supabase
            .from('workout_sections')
            .insert({ day_id: newDay.id, kind: sec.kind, title: sec.title, sort_order: sec.sort_order })
            .select('id').single();
          if (!newSec) continue;

          const exercises = [...(sec.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);
          for (const ex of exercises) {
            const { data: newEx } = await supabase
              .from('section_exercises')
              .insert({ section_id: newSec.id, name: ex.name, img_url: ex.img_url, timed: ex.timed, tempo: ex.tempo || '', coach_notes: ex.coach_notes || '', sort_order: ex.sort_order })
              .select('id').single();
            if (!newEx) continue;

            const sets = [...(ex.exercise_sets || [])].sort((a, b) => a.set_index - b.set_index);
            if (sets.length) {
              await supabase.from('exercise_sets').insert(
                sets.map(st => ({
                  exercise_id: newEx.id, set_index: st.set_index, kind: st.kind,
                  reps: st.reps, weight_kg: st.weight_kg, rest_secs: st.rest_secs,
                  time_secs: st.time_secs, intensity: st.intensity,
                }))
              );
            }
          }
        }
      }
    }
    await fetchProgrammes();
  };

  const deleteProgramme = async (progId) => {
    await supabase.from('programmes').delete().eq('id', progId);
    await fetchProgrammes();
  };

  const programme    = programmes.find(p => p.id === programmeId);
  const activeClient = clients.find(c => c.id === clientId);

  if (builderProgramme) {
    return <ProgrammeBuilder programme={builderProgramme} onClose={closeBuilder} openRoadmap={builderOpenRoadmap} trainerId={trainerId}/>;
  }

  const tabs = [
    { id: 'clients',    label: 'Clients',    count: loadingClients ? null : clients.length },
    { id: 'programmes', label: 'Programmes', count: loadingProgs ? null : programmes.length },
    { id: 'schedule',   label: 'Today',      count: null },
    { id: 'inbox',      label: 'Inbox',      count: COACH_INBOX.filter(m => m.unread).length || null },
  ];

  return (
    <div className="scroller coach-wrap">
      <CoachHeader clientCount={clients.length}/>
      <KPIRow/>

      <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 14 }}>
        {tabs.map(t => (
          <CTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} label={t.label} count={t.count}/>
        ))}
      </div>

      {tab === 'clients'    && <ClientsTab clients={clients} loading={loadingClients} onPick={setClientId} onInvite={() => setInviteOpen(true)}/>}
      {tab === 'programmes' && <ProgrammesTab programmes={programmes} loading={loadingProgs} onPick={setProgrammeId} onNew={newProgramme}/>}
      {tab === 'schedule'   && <ScheduleTab/>}
      {tab === 'inbox'      && <InboxTab/>}

      {activeClient && !activeClient.pending && (
        <ClientSheet
          c={activeClient}
          trainerId={trainerId}
          programmes={programmes}
          onClose={() => setClientId(null)}
        />
      )}
      {activeClient && activeClient.pending && (
        <PendingClientSheet c={activeClient} onClose={() => setClientId(null)}/>
      )}
      {programme && (
        <ProgrammeSheet p={programme}
          trainerId={trainerId}
          onClose={() => setProgrammeId(null)}
          onEdit={() => openBuilder(programme)}
          onDuplicate={async () => { await duplicateProgramme(programme); setProgrammeId(null); }}
          onDelete={async () => { await deleteProgramme(programme.id); setProgrammeId(null); }}
        />
      )}
      {inviteOpen && (
        <InviteSheet
          trainerId={trainerId}
          onClose={() => setInviteOpen(false)}
          onCreated={fetchClients}
        />
      )}
    </div>
  );
}

// ── DATA HELPERS ─────────────────────────────────────────────────
function shapeProgramme(p) {
  const phases = [...(p.programme_phases || [])].sort((a, b) => a.phase_index - b.phase_index);
  return {
    id: p.id, name: p.name, tag: p.tag,
    weeks: phases.reduce((s, ph) => s + (ph.weeks || 0), 0),
    phases: phases.length,
    clients: 0,
    lastEdited: relativeTime(p.updated_at),
    phaseList: phases.map(ph => ({ id: ph.id, name: ph.name, focus: ph.focus, weeks: ph.weeks })),
  };
}

function shapeClient(p) {
  const name = p.name || 'Client';
  const parts = name.trim().split(/\s+/);
  const initials = parts.map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
  const accent = CLIENT_ACCENTS[name.charCodeAt(0) % CLIENT_ACCENTS.length];
  return {
    id: p.id,
    name,
    initials,
    accent,
    status: 'active',
    phaseLabel: 'No programme assigned',
    lastSeen: '—',
    streak: 0,
    prsThisWeek: 0,
    sessionsThisWeek: 0,
    sessionsTarget: 3,
  };
}

function shapePendingClient(inv, trainerId) {
  const name = inv.client_name || 'Invited Client';
  const parts = name.trim().split(/\s+/);
  const initials = parts.map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
  const accent = CLIENT_ACCENTS[name.charCodeAt(0) % CLIENT_ACCENTS.length];
  const inviteUrl = `${window.location.origin}?invite=${inv.code}&tid=${trainerId}&name=${encodeURIComponent(name)}`;
  return {
    id: inv.id, name, initials, accent, inviteUrl,
    email: inv.client_email,
    pending: true,
    status: 'invited',
    phaseLabel: 'Invite pending',
    lastSeen: '—',
    streak: 0, prsThisWeek: 0, sessionsThisWeek: 0, sessionsTarget: 3,
  };
}

function relativeTime(iso) {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── TAB BAR ──────────────────────────────────────────────────────
function CTab({ active, onClick, label, count }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 6px',
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
      borderRadius: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      color: active ? 'var(--accent)' : 'var(--text-2)',
      fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase',
      boxShadow: active ? '0 0 calc(8px * var(--glow)) var(--accent-glow)' : 'none',
    }}>
      <span>{label.toUpperCase()}</span>
      {count != null && (
        <span style={{
          padding: '1px 6px', borderRadius: 999,
          background: active ? 'var(--accent)' : 'var(--bg-3)',
          color: active ? 'var(--on-accent)' : 'var(--text-3)',
          fontSize: 9, fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  );
}

// ── HEADER ──────────────────────────────────────────────────────
function CoachHeader({ clientCount }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 14px' }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>// COACH HUB</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>
            {dateStr} · {timeStr}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-ghost" style={{ padding: 8, position: 'relative' }}>
            <IconBell size={16}/>
            <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, background: 'var(--c-coral)', borderRadius: '50%' }}/>
          </button>
          <Hex size={36} style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: 'var(--on-accent)',
            fontFamily: 'Orbitron', fontSize: 11, fontWeight: 800,
          }}>HS</Hex>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="h-bold" style={{ fontSize: 24, lineHeight: 1.1 }}>
          COACH HUB
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>
          <strong style={{ color: 'var(--accent)' }}>{clientCount}</strong> clients ·{' '}
          <strong style={{ color: 'var(--c-amber)' }}>{COACH_INBOX.filter(m => m.unread).length} unread</strong>
        </div>
      </div>
    </>
  );
}

// ── KPI ROW ─────────────────────────────────────────────────────
function KPIRow() {
  const k = COACH_KPIS;
  const items = [
    { label: 'ACTIVE',   value: k.activeClients,  color: 'var(--accent)',  icon: <IconUser size={11}/> },
    { label: 'SESSIONS', value: k.sessionsToday,  color: 'var(--accent-2)',icon: <IconCalendar size={11}/> },
    { label: 'PRs · 7d', value: k.prsThisWeek,    color: 'var(--c-amber)', icon: <IconBolt size={11}/> },
    { label: 'INBOX',    value: k.unreadMessages, color: 'var(--c-coral)', icon: <IconBell size={11}/> },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {items.map(it => (
        <div key={it.label} className="card" style={{ padding: '10px 8px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: it.color, marginBottom: 4 }}>
            {it.icon}
            <span className="mono" style={{ fontSize: 8, letterSpacing: '0.1em', fontWeight: 700, color: it.color }}>{it.label}</span>
          </div>
          <div className="h-bold" style={{ fontSize: 22, color: it.color, lineHeight: 1 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── CLIENTS TAB ─────────────────────────────────────────────────
function ClientsTab({ clients, loading, onPick, onInvite }) {
  const [q, setQ] = React.useState('');

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10,
        padding: '8px 12px', marginBottom: 10,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients..."
          style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12 }}/>
        <button onClick={onInvite} style={{
          all: 'unset', cursor: 'pointer',
          padding: '4px 8px', borderRadius: 6,
          background: 'var(--accent-soft)', color: 'var(--accent)',
          fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', fontWeight: 600,
        }}>+ NEW CLIENT</button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>
          LOADING…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(c => <ClientRow key={c.id} c={c} onPick={() => onPick(c.id)}/>)}
          {filtered.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>
                {clients.length === 0 ? 'NO CLIENTS YET' : 'NO CLIENTS MATCH'}
              </div>
              {clients.length === 0 && (
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Invite clients to get started.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ClientRow({ c, onPick }) {
  const statusColor = c.status === 'invited'         ? 'var(--c-amber)'
                    : c.status === 'needs-attention' ? 'var(--c-coral)'
                    : c.status === 'inactive'        ? 'var(--text-3)'
                    : c.status === 'new'             ? 'var(--c-amber)'
                    :                                  'var(--accent)';
  return (
    <button onClick={onPick} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div className="card" style={{
        padding: 12, display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 12,
        alignItems: 'center', borderLeft: `2px solid ${statusColor}`,
        opacity: c.pending ? 0.85 : 1,
      }}>
        <Hex size={40} style={{
          background: c.accent, color: 'var(--on-accent)',
          fontFamily: 'Orbitron', fontSize: 12, fontWeight: 800,
        }}>{c.initials}</Hex>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            {c.pending && (
              <span className="mono" style={{ fontSize: 8, color: 'var(--c-amber)', letterSpacing: '0.1em', fontWeight: 700, flexShrink: 0 }}>PENDING</span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.pending ? (c.email || 'INVITE NOT YET ACCEPTED') : c.phaseLabel.toUpperCase()}
          </div>
          {!c.pending && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 4 }}>
              LAST SEEN: {c.lastSeen.toUpperCase()}
            </div>
          )}
        </div>

        <IconChevronRight size={16} style={{ color: 'var(--text-3)' }}/>
      </div>
    </button>
  );
}

// ── PROGRAMMES TAB ──────────────────────────────────────────────
function ProgrammesTab({ programmes, loading, onPick, onNew }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="label">// PROGRAMMES · {loading ? '…' : programmes.length}</div>
        <button onClick={onNew} className="btn-ghost" style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: 10 }}>
          + NEW PROGRAMME
        </button>
      </div>
      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>
          LOADING…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {programmes.map(p => <ProgrammeCard key={p.id} p={p} onPick={() => onPick(p.id)}/>)}
          {programmes.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>
                NO PROGRAMMES YET
              </div>
              <button onClick={onNew} className="btn-primary" style={{ fontSize: 11, padding: '10px 18px' }}>
                + CREATE FIRST PROGRAMME
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ProgrammeCard({ p, onPick }) {
  const tagColor = p.tag === 'STRENGTH' ? 'var(--accent)'
                 : p.tag === 'ONBOARD'  ? 'var(--c-amber)'
                 : p.tag === 'REHAB'    ? 'var(--c-coral)'
                 :                        'var(--c-blue)';
  return (
    <button onClick={onPick} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="chip" style={{ fontSize: 8, padding: '2px 6px', color: tagColor, borderColor: 'currentColor' }}>{p.tag}</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
                {p.weeks} WK · {p.phases} PHASE{p.phases !== 1 ? 'S' : ''}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
          </div>
          {p.clients > 0 && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {p.clients} CLIENT{p.clients !== 1 ? 'S' : ''}
            </span>
          )}
        </div>

        {p.phaseList.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.phaseList.length}, 1fr)`, gap: 4, marginBottom: 8 }}>
            {p.phaseList.map((ph, i) => (
              <div key={i} style={{
                padding: '6px 8px', borderRadius: 6,
                background: 'var(--bg-3)', border: '1px solid var(--line)',
              }}>
                <div className="mono" style={{ fontSize: 8, color: tagColor, letterSpacing: '0.1em', fontWeight: 600 }}>P{i+1} · {ph.weeks}W</div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ph.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            UPDATED {p.lastEdited.toUpperCase()}
          </span>
          <IconChevronRight size={14} style={{ color: 'var(--text-3)' }}/>
        </div>
      </div>
    </button>
  );
}

// ── SCHEDULE TAB ────────────────────────────────────────────────
function ScheduleTab() {
  const sched = COACH_SCHEDULE;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div className="label">// TODAY · {sched.length} SESSIONS</div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
          {sched.filter(s => s.status === 'done').length}/{sched.length} DONE
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8, position: 'relative' }}>
        {sched.map((s, i) => <ScheduleRow key={s.id} s={s} last={i === sched.length - 1}/>)}
      </div>
    </>
  );
}

function ScheduleRow({ s, last }) {
  const kindMeta = {
    LIVE_PT:  { label: 'LIVE PT',  color: 'var(--accent)'   },
    CHECK_IN: { label: 'CHECK-IN', color: 'var(--c-amber)'  },
    REVIEW:   { label: 'REVIEW',   color: 'var(--accent-2)' },
    INTAKE:   { label: 'INTAKE',   color: 'var(--c-coral)'  },
  }[s.kind] || { label: 'SESSION', color: 'var(--accent)' };

  const statusMeta = {
    done:     { color: 'var(--text-3)',  label: '✓ DONE' },
    live:     { color: 'var(--c-coral)', label: '● LIVE' },
    upcoming: { color: 'var(--text-2)',  label: '○ UPCOMING' },
  }[s.status];

  const client = COACH_CLIENTS.find(c => c.id === s.clientId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10, position: 'relative' }}>
      <div style={{ textAlign: 'right', paddingRight: 8, position: 'relative' }}>
        <div className="mono" style={{ fontSize: 12, color: s.status === 'live' ? 'var(--c-coral)' : 'var(--text)', fontWeight: 600, letterSpacing: '0.04em' }}>
          {s.time}
        </div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, letterSpacing: '0.08em' }}>
          {s.duration}M
        </div>
        <div style={{ position: 'absolute', right: -1, top: 28, bottom: last ? 0 : -10, width: 1, background: 'var(--line)' }}/>
        <span style={{
          position: 'absolute', right: -4, top: 6,
          width: 7, height: 7, borderRadius: '50%',
          background: s.status === 'live' ? 'var(--c-coral)' : s.status === 'done' ? 'var(--text-3)' : kindMeta.color,
          border: '1.5px solid var(--bg-1)',
          boxShadow: s.status === 'live' ? '0 0 8px var(--c-coral)' : 'none',
        }}/>
      </div>

      <div className="card" style={{
        padding: 12,
        background: s.status === 'live' ? 'rgba(238,106,106,0.05)' : 'var(--bg-2)',
        borderColor: s.status === 'live' ? 'color-mix(in srgb, var(--c-coral) 40%, var(--line))' : 'var(--line)',
        boxShadow: s.status === 'live' ? '0 0 calc(10px * var(--glow)) rgba(238,106,106,0.25)' : 'none',
        opacity: s.status === 'done' ? 0.6 : 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <span className="chip" style={{ fontSize: 8, padding: '1px 6px', color: kindMeta.color, borderColor: 'currentColor' }}>
            {kindMeta.label}
          </span>
          <span className="mono" style={{ fontSize: 9, color: statusMeta.color, letterSpacing: '0.1em' }}>
            {statusMeta.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {client && (
            <Hex size={22} style={{
              background: client.accent, color: 'var(--on-accent)',
              fontFamily: 'Orbitron', fontSize: 8, fontWeight: 800, flexShrink: 0,
            }}>{client.initials}</Hex>
          )}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{s.client}</span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em', lineHeight: 1.4 }}>
          {s.note}
        </div>
      </div>
    </div>
  );
}

// ── INBOX TAB ───────────────────────────────────────────────────
function InboxTab() {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {COACH_INBOX.map(m => <InboxRow key={m.id} m={m}/>)}
    </div>
  );
}

function InboxRow({ m }) {
  return (
    <button style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div className="card" style={{
        padding: 12, display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10,
        alignItems: 'center',
        background: m.unread ? 'rgba(70,187,192,0.04)' : 'var(--bg-2)',
        borderColor: m.unread ? 'color-mix(in srgb, var(--accent) 22%, var(--line))' : 'var(--line)',
      }}>
        <Hex size={32} style={{
          background: m.accent, color: 'var(--on-accent)',
          fontFamily: 'Orbitron', fontSize: 10, fontWeight: 800,
        }}>{m.initials}</Hex>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: m.unread ? 700 : 500, color: m.unread ? 'var(--text)' : 'var(--text-2)' }}>
              {m.from}
            </span>
            {m.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)' }}/>}
          </div>
          <div style={{
            fontSize: 12, color: m.unread ? 'var(--text-2)' : 'var(--text-3)',
            marginTop: 3, lineHeight: 1.35,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {m.preview}
          </div>
        </div>
        <span className="mono" style={{ fontSize: 9, color: m.unread ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.08em', alignSelf: 'flex-start', marginTop: 2 }}>
          {m.when.toUpperCase()}
        </span>
      </div>
    </button>
  );
}

// ── CLIENT DETAIL SHEET ─────────────────────────────────────────
function ClientSheet({ c, trainerId, programmes, onClose }) {
  const [assignOpen, setAssignOpen] = React.useState(false);
  if (!c) return null;

  if (assignOpen) {
    return (
      <AssignSheet
        clientId={c.id}
        clientName={c.name}
        trainerId={trainerId}
        programmes={programmes}
        onClose={() => setAssignOpen(false)}
      />
    );
  }

  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Hex size={54} style={{
            background: c.accent, color: 'var(--on-accent)',
            fontFamily: 'Orbitron', fontSize: 16, fontWeight: 800,
          }}>{c.initials}</Hex>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h-bold" style={{ fontSize: 18 }}>{c.name.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 4 }}>
              {c.phaseLabel.toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 16 }}>
          <SmallKpi label="STREAK" value={c.streak} unit="d" color="var(--c-amber)"/>
          <SmallKpi label="PRs · 7d" value={c.prsThisWeek} color="var(--accent-2)"/>
          <SmallKpi label="SESSIONS" value={`${c.sessionsThisWeek}/${c.sessionsTarget}`} color="var(--text-2)"/>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '14px 18px 18px', minHeight: 0 }}>
        <div className="label" style={{ marginBottom: 8 }}>// QUICK ACTIONS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SheetAction icon="✉" label="MESSAGE"/>
          <SheetAction icon="◯" label="LOG SESSION"/>
          <SheetAction icon="◢" label="ASSIGN WORKOUT" onClick={() => setAssignOpen(true)}/>
          <SheetAction icon="▣" label="CHECK-IN"/>
        </div>
      </div>

      <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)' }}>
        <button className="btn-primary" style={{ width: '100%' }}>OPEN FULL CLIENT FILE</button>
      </div>
    </SheetShell>
  );
}

function SmallKpi({ label, value, unit, color }) {
  return (
    <div style={{
      padding: '8px 6px', borderRadius: 8,
      background: 'var(--bg-2)', border: '1px solid var(--line)',
      textAlign: 'center',
    }}>
      <div className="mono" style={{ fontSize: 8, color: color, letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 16, color: color, marginTop: 2, lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 1 }}>{unit}</span>}
      </div>
    </div>
  );
}

function SheetAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer',
      padding: '12px 10px', borderRadius: 10,
      background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'var(--accent-soft)',
        display: 'grid', placeItems: 'center',
        color: 'var(--accent)', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 13,
      }}>{icon}</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text)', letterSpacing: '0.1em', fontWeight: 600 }}>
        {label}
      </span>
    </button>
  );
}

// ── ASSIGN WORKOUT SHEET ────────────────────────────────────────
function AssignSheet({ clientId, clientName, trainerId, programmes, onClose }) {
  const [progId, setProgId]       = React.useState(null);
  const [phaseIdx, setPhaseIdx]   = React.useState(0);
  const [week, setWeek]           = React.useState(1);
  const [days, setDays]           = React.useState([]);
  const [loadingDays, setLoadingDays] = React.useState(false);
  const [dayId, setDayId]         = React.useState(null);
  const [date, setDate]           = React.useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving]       = React.useState(false);
  const [saved, setSaved]         = React.useState(false);

  const prog  = programmes.find(p => p.id === progId);
  const phase = prog?.phaseList?.[phaseIdx];

  React.useEffect(() => {
    if (!phase?.id) { setDays([]); return; }
    setDayId(null);
    setLoadingDays(true);
    supabase
      .from('programme_days')
      .select('id, day_of_week, notes')
      .eq('phase_id', phase.id)
      .eq('week_index', week - 1)
      .order('day_of_week')
      .then(({ data }) => { setDays(data || []); setLoadingDays(false); });
  }, [phase?.id, week]);

  const assign = async () => {
    if (!dayId || !date || saving) return;
    setSaving(true);
    const { error } = await supabase.from('client_workouts').insert({
      client_id: clientId,
      trainer_id: trainerId,
      day_id: dayId,
      scheduled_date: date,
      status: 'scheduled',
    });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(onClose, 1400);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div className="label" style={{ marginBottom: 4 }}>// ASSIGN WORKOUT</div>
        <div className="h-bold" style={{ fontSize: 20 }}>TO {clientName.toUpperCase()}</div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '16px 18px', minHeight: 0, display: 'grid', gap: 18, alignContent: 'start' }}>

        {/* 1. Programme */}
        <div>
          <div className="label" style={{ marginBottom: 8 }}>// PROGRAMME</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {programmes.length === 0 && (
              <div className="card" style={{ padding: 14, textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                No programmes yet — create one first.
              </div>
            )}
            {programmes.map(p => (
              <button key={p.id}
                onClick={() => { setProgId(p.id); setPhaseIdx(0); setWeek(1); setDayId(null); }}
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '10px 14px', borderRadius: 10,
                  background: progId === p.id ? 'var(--accent-soft)' : 'var(--bg-2)',
                  border: '1px solid ' + (progId === p.id ? 'var(--accent)' : 'var(--line)'),
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {p.name}
                </span>
                <span className="mono" style={{ fontSize: 9, color: progId === p.id ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.1em' }}>
                  {p.weeks}W · {p.phases} PHASE{p.phases !== 1 ? 'S' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Phase */}
        {prog && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>// PHASE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {prog.phaseList.map((ph, i) => (
                <button key={i}
                  onClick={() => { setPhaseIdx(i); setWeek(1); setDayId(null); }}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '6px 12px', borderRadius: 8,
                    background: phaseIdx === i ? 'var(--accent)' : 'var(--bg-2)',
                    border: '1px solid ' + (phaseIdx === i ? 'var(--accent)' : 'var(--line-strong)'),
                    color: phaseIdx === i ? 'var(--on-accent)' : 'var(--text-2)',
                    fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                  }}>
                  P{i + 1} · {ph.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. Week */}
        {phase && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>// WEEK</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => { setWeek(w => Math.max(1, w - 1)); setDayId(null); }}
                disabled={week <= 1}
                style={{
                  all: 'unset', cursor: week > 1 ? 'pointer' : 'default',
                  opacity: week <= 1 ? 0.3 : 1,
                  width: 34, height: 34, borderRadius: 8,
                  background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                  display: 'grid', placeItems: 'center', color: 'var(--text)', fontSize: 18,
                }}>
                <IconChevronLeft size={16}/>
              </button>
              <div className="mono" style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em' }}>
                WEEK {week} / {phase.weeks}
              </div>
              <button
                onClick={() => { setWeek(w => Math.min(phase.weeks, w + 1)); setDayId(null); }}
                disabled={week >= phase.weeks}
                style={{
                  all: 'unset', cursor: week < phase.weeks ? 'pointer' : 'default',
                  opacity: week >= phase.weeks ? 0.3 : 1,
                  width: 34, height: 34, borderRadius: 8,
                  background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                  display: 'grid', placeItems: 'center', color: 'var(--text)',
                }}>
                <IconChevronRight size={16}/>
              </button>
            </div>
          </div>
        )}

        {/* 4. Day */}
        {phase && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              // SESSION{loadingDays ? ' · LOADING…' : days.length ? ` · ${days.length} AVAILABLE` : ' · NONE BUILT'}
            </div>
            {loadingDays ? (
              <div style={{ color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, padding: '8px 0' }}>Loading…</div>
            ) : days.length === 0 ? (
              <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
                  No sessions built for Week {week}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {days.map(d => (
                  <button key={d.id} onClick={() => setDayId(d.id)}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      padding: '11px 14px', borderRadius: 10,
                      background: dayId === d.id ? 'var(--accent-soft)' : 'var(--bg-2)',
                      border: '1px solid ' + (dayId === d.id ? 'var(--accent)' : 'var(--line)'),
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {DAY_LABELS[d.day_of_week] || `Day ${d.day_of_week + 1}`}
                    </span>
                    {d.notes && (
                      <span className="mono" style={{
                        fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
                      }}>
                        {d.notes.slice(0, 50)}
                      </span>
                    )}
                    {dayId === d.id && <IconCheck size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginLeft: 8 }}/>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Date */}
        {dayId && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>// SCHEDULED DATE</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                borderRadius: 10, padding: '11px 12px',
                color: 'var(--text)', outline: 'none',
                fontFamily: 'JetBrains Mono', fontSize: 13,
              }}
            />
          </div>
        )}
      </div>

      <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        {saved ? (
          <div style={{
            textAlign: 'center', padding: '14px',
            color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 13,
            fontWeight: 700, letterSpacing: '0.14em',
          }}>
            ✓ WORKOUT ASSIGNED
          </div>
        ) : (
          <button
            onClick={assign}
            disabled={!dayId || !date || saving}
            className="btn-primary"
            style={{ width: '100%', opacity: dayId && date ? 1 : 0.4, pointerEvents: dayId && date ? 'auto' : 'none' }}>
            {saving ? 'ASSIGNING…' : 'ASSIGN WORKOUT →'}
          </button>
        )}
      </div>
    </SheetShell>
  );
}

// ── PENDING CLIENT SHEET ─────────────────────────────────────────
function PendingClientSheet({ c, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(c.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Hex size={54} style={{ background: c.accent, color: 'var(--on-accent)', fontFamily: 'Orbitron', fontSize: 16, fontWeight: 800 }}>{c.initials}</Hex>
          <div>
            <div className="h-bold" style={{ fontSize: 18 }}>{c.name.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--c-amber)', letterSpacing: '0.1em', fontWeight: 700, marginTop: 4 }}>
              ◎ INVITE PENDING
            </div>
            {c.email && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3 }}>{c.email}</div>
            )}
          </div>
        </div>
      </div>
      <div className="scroller" style={{ flex: 1, padding: '16px 18px', minHeight: 0, display: 'grid', gap: 16, alignContent: 'start' }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          This client hasn't signed up yet. Send them the link below — when they create their account they'll be connected to you automatically.
        </div>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>// INVITE LINK</div>
          <div style={{
            padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
            borderRadius: 10, wordBreak: 'break-all',
            fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-2)', lineHeight: 1.7,
          }}>{c.inviteUrl}</div>
        </div>
        <button onClick={copy} className={copied ? 'btn-primary' : 'btn-ghost'} style={{ width: '100%' }}>
          {copied ? '✓ COPIED' : '⎘ COPY INVITE LINK'}
        </button>
      </div>
    </SheetShell>
  );
}

// ── INVITE SHEET ────────────────────────────────────────────────
function InviteSheet({ trainerId, onClose, onCreated }) {
  const [clientName,  setClientName]  = React.useState('');
  const [clientEmail, setClientEmail] = React.useState('');
  const [saving,      setSaving]      = React.useState(false);
  const [inviteUrl,   setInviteUrl]   = React.useState(null);
  const [copied,      setCopied]      = React.useState(false);
  const [error,       setError]       = React.useState(null);

  const create = async () => {
    if (!clientName.trim() || saving) return;
    setSaving(true);
    setError(null);
    const { data: invite, error: err } = await supabase
      .from('invites')
      .insert({ trainer_id: trainerId, client_name: clientName.trim(), client_email: clientEmail.trim() })
      .select('code')
      .single();
    setSaving(false);
    if (err || !invite) { setError(err?.message || 'Could not create invite'); return; }
    const url = `${window.location.origin}?invite=${invite.code}&tid=${trainerId}&name=${encodeURIComponent(clientName.trim())}`;
    setInviteUrl(url);
    onCreated?.();
  };

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div className="label" style={{ marginBottom: 4 }}>// INVITE CLIENT</div>
        <div className="h-bold" style={{ fontSize: 20 }}>NEW CLIENT INVITE</div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '16px 18px', minHeight: 0, display: 'grid', gap: 16, alignContent: 'start' }}>
        {!inviteUrl ? (
          <>
            {error && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', padding: '10px 12px', background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)', borderRadius: 8, letterSpacing: '0.04em' }}>
                {error}
              </div>
            )}
            <div>
              <div className="label" style={{ marginBottom: 7 }}>// CLIENT NAME</div>
              <input
                value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Sarah Jones"
                style={inviteInputSt}
              />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 7 }}>// CLIENT EMAIL (OPTIONAL)</div>
              <input
                type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                placeholder="client@email.com"
                style={inviteInputSt}
              />
            </div>
            <div className="mono" style={{
              fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6,
              padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8,
            }}>
              Generates a one-time sign-up link. The client clicks it to create their account and connect to you automatically.
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--accent)', filter: 'drop-shadow(0 0 calc(10px * var(--glow)) var(--accent-glow))' }}>✓</div>
              <div className="h-bold" style={{ fontSize: 16, color: 'var(--accent)', marginBottom: 4 }}>INVITE CREATED</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>FOR {clientName.toUpperCase()}</div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 7 }}>// INVITE LINK</div>
              <div style={{
                padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                borderRadius: 10, wordBreak: 'break-all',
                fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-2)', lineHeight: 1.7,
              }}>{inviteUrl}</div>
            </div>
            <button onClick={copy} className={copied ? 'btn-primary' : 'btn-ghost'} style={{ width: '100%' }}>
              {copied ? '✓ COPIED' : '⎘ COPY INVITE LINK'}
            </button>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
              Send this to your client. They sign up via the link and are connected to your account automatically.
            </div>
          </>
        )}
      </div>

      {!inviteUrl && (
        <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <button
            onClick={create}
            disabled={!clientName.trim() || saving}
            className="btn-primary"
            style={{ width: '100%', opacity: clientName.trim() ? 1 : 0.4, pointerEvents: clientName.trim() ? 'auto' : 'none' }}>
            {saving ? 'CREATING…' : 'CREATE INVITE LINK →'}
          </button>
        </div>
      )}
    </SheetShell>
  );
}

const inviteInputSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
  borderRadius: 10, padding: '12px 14px',
  color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 13,
  outline: 'none',
};

// ── PROGRAMME DETAIL SHEET ──────────────────────────────────────
function ProgrammeSheet({ p, trainerId, onClose, onEdit, onDuplicate, onDelete }) {
  const [assignedClients, setAssignedClients] = React.useState(null);
  const [duplicating, setDuplicating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function loadClients() {
      const phaseIds = (p.phaseList || []).map(ph => ph.id).filter(Boolean);
      if (!phaseIds.length) { setAssignedClients([]); return; }

      const { data: days } = await supabase
        .from('programme_days')
        .select('id')
        .in('phase_id', phaseIds);

      if (!days?.length) { if (!cancelled) setAssignedClients([]); return; }

      const dayIds = days.map(d => d.id);
      const { data: workouts } = await supabase
        .from('client_workouts')
        .select('client_id')
        .in('day_id', dayIds);

      if (!workouts?.length) { if (!cancelled) setAssignedClients([]); return; }

      const uniqueIds = [...new Set(workouts.map(w => w.client_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', uniqueIds);

      if (!cancelled) setAssignedClients(profiles || []);
    }
    loadClients();
    return () => { cancelled = true; };
  }, [p.id]);

  const handleDuplicate = async () => {
    setDuplicating(true);
    await onDuplicate();
    setDuplicating(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await onDelete();
  };

  const clientCount = assignedClients === null ? p.clients : assignedClients.length;

  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.14em', fontWeight: 600, marginBottom: 4 }}>
              // PROGRAMME
            </div>
            <div className="h-bold" style={{ fontSize: 22, lineHeight: 1.1 }}>{p.name.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 6 }}>
              {p.weeks} WEEKS · {p.phases} PHASE{p.phases !== 1 ? 'S' : ''} · {clientCount} CLIENT{clientCount !== 1 ? 'S' : ''}
            </div>
          </div>
          <span className="chip chip-accent" style={{ fontSize: 9 }}>{p.tag}</span>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '16px 18px 18px', minHeight: 0 }}>
        <div className="label" style={{ marginBottom: 10 }}>// PHASES</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {p.phaseList.map((ph, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12,
              alignItems: 'center', padding: '12px 14px',
              background: 'var(--bg-2)', border: '1px solid var(--line)',
              borderRadius: 10, borderLeft: '2px solid var(--accent)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                display: 'grid', placeItems: 'center',
                color: 'var(--accent)', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 12,
              }}>P{i+1}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ph.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3 }}>
                  {ph.weeks} WK · {ph.focus.toUpperCase()}
                </div>
              </div>
              <IconChevronRight size={14} style={{ color: 'var(--text-3)' }}/>
            </div>
          ))}
        </div>

        <div className="label" style={{ marginBottom: 10 }}>// ASSIGNED CLIENTS</div>
        {assignedClients === null ? (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0' }}>Loading…</div>
        ) : assignedClients.length === 0 ? (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0' }}>No clients assigned yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {assignedClients.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--bg-2)',
                border: '1px solid var(--line)', borderRadius: 10,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                  display: 'grid', placeItems: 'center',
                  color: 'var(--accent)', fontWeight: 800, fontSize: 11,
                }}>{(c.name || '?')[0].toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name || 'Unnamed'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-ghost"
            style={{ flex: 1, opacity: duplicating ? 0.6 : 1 }}
            disabled={duplicating}
            onClick={handleDuplicate}
          >
            {duplicating ? 'COPYING…' : 'DUPLICATE'}
          </button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={onEdit}>EDIT</button>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            all: 'unset', cursor: 'pointer',
            width: '100%', boxSizing: 'border-box',
            padding: '11px 0', textAlign: 'center',
            borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: 'JetBrains Mono',
            background: confirmDelete ? 'color-mix(in srgb, var(--c-coral) 18%, transparent)' : 'transparent',
            border: `1px solid ${confirmDelete ? 'var(--c-coral)' : 'color-mix(in srgb, var(--c-coral) 40%, transparent)'}`,
            color: 'var(--c-coral)',
            transition: 'all 0.15s',
          }}
        >
          {deleting ? 'DELETING…' : confirmDelete ? 'CONFIRM DELETE' : 'DELETE PROGRAMME'}
        </button>
        {confirmDelete && !deleting && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
            This cannot be undone. Tap again to confirm.
          </div>
        )}
      </div>
    </SheetShell>
  );
}

// ── SHEET SHELL ─────────────────────────────────────────────────
function SheetShell({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(7,7,12,0.65)', backdropFilter: 'blur(8px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', inset: 0,
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '54px 18px 4px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <HexBackButton onClick={onClose} size={36} />
          <button style={{
            all: 'unset', cursor: 'pointer',
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            display: 'grid', placeItems: 'center', color: 'var(--text)',
          }}>
            <IconMore size={16}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
