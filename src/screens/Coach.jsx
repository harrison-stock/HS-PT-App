import React from 'react'
import { supabase } from '../lib/supabase'
import { Hex, HexBackButton } from '../components/hex'
import { IconBell, IconBolt, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconMore, IconUser, IconPlus, IconX2 } from '../components/icons'
import { ProgrammeBuilder } from './ProgrammeBuilder'
import { ClientDetail } from './ClientDetail'
import { loadForms } from '../lib/forms'
import { notify } from '../lib/notifications'

const CLIENT_ACCENTS = ['#46BBC0','#189CAA','#F39E1F','#EE6A6A','#3F84D9','#E0A5BB','#8086A3'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function computeStreak(daysSet, lastDate) {
  if (!lastDate) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (lastDate < yesterday) return 0;
  let streak = 0;
  let check = today;
  while (daysSet.has(check)) {
    streak++;
    check = new Date(new Date(check).getTime() - 86_400_000).toISOString().slice(0, 10);
  }
  return streak;
}

export function Coach({ go, trainerId, unread = 0, only }) {
  const [tab, setTab]                       = React.useState('clients');
  const [hubTab, setHubTab]                 = React.useState('programmes');
  const [clientId, setClientId]             = React.useState(null);
  const [programmeId, setProgrammeId]       = React.useState(null);
  const [builderProgramme, setBuilderProgramme] = React.useState(null);
  const [builderOpenRoadmap, setBuilderOpenRoadmap] = React.useState(false);
  const [programmes, setProgrammes]         = React.useState([]);
  const [loadingProgs, setLoadingProgs]     = React.useState(true);
  const [progClients, setProgClients]       = React.useState({}); // programmeId → [clientId]
  const [clients, setClients]               = React.useState([]);
  const [archivedClients, setArchivedClients] = React.useState([]);
  const [loadingClients, setLoadingClients] = React.useState(true);
  const [inviteOpen, setInviteOpen]         = React.useState(false);
  const [todaySchedule, setTodaySchedule]   = React.useState(null);

  React.useEffect(() => {
    fetchProgrammes();
    fetchClients();
    fetchTodaySchedule();
  }, []);

  const fetchTodaySchedule = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('client_workouts')
      .select('id, client_id, status, programme_days ( day_of_week, programme_phases ( name, programmes ( name ) ) )')
      .eq('trainer_id', trainerId)
      .eq('scheduled_date', today)
      .neq('status', 'skipped');
    setTodaySchedule(data || []);
  };

  const fetchProgrammes = async () => {
    setLoadingProgs(true);
    const [{ data }, { data: assigned }] = await Promise.all([
      supabase.from('programmes').select('*, programme_phases(*)').order('updated_at', { ascending: false }),
      supabase.from('client_workouts').select('client_id, programme_days(programme_phases(programme_id))'),
    ]);
    if (data) setProgrammes(data.map(shapeProgramme));
    const map = {};
    (assigned || []).forEach(w => {
      const pid = w.programme_days?.programme_phases?.programme_id;
      if (pid && w.client_id) (map[pid] = map[pid] || new Set()).add(w.client_id);
    });
    const obj = {};
    Object.keys(map).forEach(pid => { obj[pid] = [...map[pid]]; });
    setProgClients(obj);
    setLoadingProgs(false);
  };

  const setProgrammeStatus = async (id, status) => {
    setProgrammes(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    await supabase.from('programmes').update({ status }).eq('id', id);
  };

  const fetchClients = async () => {
    setLoadingClients(true);
    const [{ data: profiles }, { data: managed }, { data: archived }] = await Promise.all([
      supabase.from('profiles')
        .select('id, name, email, credits, client_status, subscription_due, timezone, archived')
        .eq('trainer_id', trainerId).eq('role', 'client').eq('archived', false),
      supabase.from('managed_clients')
        .select('id, name, email, credits, client_status')
        .eq('trainer_id', trainerId).is('linked_profile_id', null),
      supabase.from('profiles')
        .select('id, name, email, credits, client_status')
        .eq('trainer_id', trainerId).eq('role', 'client').eq('archived', true),
    ]);
    const real    = (profiles || []).map(shapeClient);
    const pending = (managed  || []).map(shapeManagedClient);
    setArchivedClients((archived || []).map(shapeClient));

    // Batch-load session stats for real clients
    if (real.length > 0) {
      const ids   = real.map(c => c.id);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('client_id, started_at')
        .in('client_id', ids)
        .gte('started_at', since)
        .order('started_at', { ascending: false });

      const week7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const statsByClient = {};
      ids.forEach(id => { statsByClient[id] = { sessionsThisWeek: 0, days: new Set(), lastDate: null }; });
      (sessions || []).forEach(s => {
        const st = statsByClient[s.client_id];
        if (!st) return;
        const day = s.started_at.slice(0, 10);
        st.days.add(day);
        if (!st.lastDate) st.lastDate = day;
        if (s.started_at >= week7) st.sessionsThisWeek++;
      });

      real.forEach(c => {
        const st = statsByClient[c.id];
        if (!st) return;
        c.sessionsThisWeek = st.sessionsThisWeek;
        c.streak = computeStreak(st.days, st.lastDate);
        if (st.lastDate) {
          const d = Math.floor((Date.now() - new Date(st.lastDate).getTime()) / 86_400_000);
          c.lastSeen = d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
        }
      });
    }

    setClients([...real, ...pending]);
    setLoadingClients(false);
  };

  // Bring an archived client back onto the active roster.
  const restoreClient = async (c) => {
    setArchivedClients(prev => prev.filter(x => x.id !== c.id));
    await supabase.from('profiles').update({ archived: false }).eq('id', c.id);
    fetchClients();
  };

  // Permanently remove a client from this trainer's roster. Real accounts are
  // backed by an Auth user that only the service role can delete, so this runs
  // through the delete-client edge function (managed clients are deleted there
  // too). Returns an error string on failure so the UI can surface it.
  const removeClient = async (c) => {
    const prev = archivedClients;
    setArchivedClients(p => p.filter(x => x.id !== c.id));
    const { data, error } = await supabase.functions.invoke('delete-client', {
      body: { clientId: c.id, managed: !!c.managed },
    });
    if (error || data?.error) {
      setArchivedClients(prev); // roll back the optimistic removal
      return error?.message || data?.error || 'Could not remove client';
    }
    fetchClients();
    return null;
  };

  const newProgramme = () => {
    setBuilderOpenRoadmap(true);
    setBuilderProgramme({
      id: null,
      name: 'New Programme', tag: 'STRENGTH', is_adhoc: false,
      weeks: 4, phases: 1, clients: 0,
      lastEdited: 'new',
      phaseList: [{ id: null, name: 'Phase 1', focus: 'Foundation', weeks: 4 }],
    });
  };

  // Ad-hoc workout = a one-off single-session "programme" (one phase, one
  // week, one day). Skips the roadmap — straight into the day builder.
  const newAdhoc = () => {
    setBuilderOpenRoadmap(false);
    setBuilderProgramme({
      id: null,
      name: 'New Workout', tag: 'STRENGTH', is_adhoc: true,
      weeks: 1, phases: 1, clients: 0,
      lastEdited: 'new',
      phaseList: [{ id: null, name: 'Workout', focus: 'Ad-hoc session', weeks: 1 }],
    });
  };

  const openBuilder = (prog) => { setProgrammeId(null); setBuilderOpenRoadmap(false); setBuilderProgramme(prog); };
  const closeBuilder = () => { setBuilderProgramme(null); fetchProgrammes(); };

  const duplicateProgramme = async (prog) => {
    const { data: newProg } = await supabase
      .from('programmes')
      .insert({ trainer_id: trainerId, name: prog.name + ' (Copy)', tag: prog.tag, is_adhoc: !!prog.is_adhoc })
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

  // Dedicated Programmes hub (its own bottom-nav tab) — programmes, ad-hoc
  // workouts and reusable task templates.
  if (only === 'programmes') {
    const fullProgrammes = programmes.filter(p => !p.is_adhoc);
    const adhocWorkouts  = programmes.filter(p => p.is_adhoc);
    const hubTabs = [
      { id: 'programmes', label: 'Programmes', count: loadingProgs ? null : fullProgrammes.length },
      { id: 'adhoc',      label: 'Ad-hoc',     count: loadingProgs ? null : adhocWorkouts.length },
      { id: 'templates',  label: 'Task Templates' },
    ];
    return (
      <div className="scroller coach-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '8px 0 14px' }}>
          <div>
            <div className="label">// COACH</div>
            <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>BUILD HUB</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {hubTabs.map(t => (
            <CTab key={t.id} active={hubTab === t.id} onClick={() => setHubTab(t.id)} label={t.label} count={t.count}/>
          ))}
        </div>

        {hubTab === 'programmes' && (
          <ProgrammesTab
            programmes={fullProgrammes} loading={loadingProgs} progClients={progClients} clients={clients}
            onPick={setProgrammeId} onNew={newProgramme}
            onEdit={openBuilder}
            onDuplicate={duplicateProgramme}
            onSetStatus={setProgrammeStatus}
            onDelete={async (id) => { await deleteProgramme(id); }}
          />
        )}

        {hubTab === 'adhoc' && (
          <AdhocTab
            workouts={adhocWorkouts} loading={loadingProgs}
            clients={clients} trainerId={trainerId}
            onNew={newAdhoc} onEdit={openBuilder}
            onDuplicate={duplicateProgramme}
            onDelete={async (id) => { await deleteProgramme(id); }}
          />
        )}

        {hubTab === 'templates' && <TaskTemplatesTab trainerId={trainerId}/>}

        {programme && (
          <ProgrammeSheet p={programme}
            trainerId={trainerId}
            onClose={() => setProgrammeId(null)}
            onEdit={() => openBuilder(programme)}
            onDuplicate={async () => { await duplicateProgramme(programme); setProgrammeId(null); }}
            onDelete={async () => { await deleteProgramme(programme.id); setProgrammeId(null); }}
          />
        )}
      </div>
    );
  }

  const pendingCount = clients.filter(c => c.managed).length;
  const kpis = {
    active:     clients.filter(c => !c.managed).length,
    pending:    pendingCount,
    today:      todaySchedule === null ? '…' : todaySchedule.length,
    sessions7d: clients.reduce((n, c) => n + (c.sessionsThisWeek || 0), 0),
  };

  const tabs = [
    { id: 'clients',    label: 'Clients',    count: loadingClients ? null : clients.length },
    { id: 'schedule',   label: 'Today',      count: todaySchedule?.length || null },
  ];

  return (
    <div className="scroller coach-wrap">
      <CoachHeader clientCount={clients.length} pendingCount={pendingCount} go={go} unread={unread}/>
      <KPIRow kpis={kpis}/>

      <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 14 }}>
        {tabs.map(t => (
          <CTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} label={t.label} count={t.count}/>
        ))}
      </div>

      {tab === 'clients'    && <ClientsTab clients={clients} archived={archivedClients} loading={loadingClients} onPick={setClientId} onInvite={() => setInviteOpen(true)} onRestore={restoreClient} onRemove={removeClient}/>}
      {tab === 'schedule'   && <ScheduleTab schedule={todaySchedule} clients={clients} onPick={setClientId}/>}

      {activeClient && (
        <ClientDetail
          c={activeClient}
          trainerId={trainerId}
          programmes={programmes}
          onClose={() => setClientId(null)}
          onChanged={() => { fetchClients(); fetchTodaySchedule(); }}
          go={go}
        />
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
    id: p.id, name: p.name, tag: p.tag, is_adhoc: !!p.is_adhoc, status: p.status || 'active',
    weeks: phases.reduce((s, ph) => s + (ph.weeks || 0), 0),
    phases: phases.length,
    clients: 0,
    lastEdited: relativeTime(p.updated_at),
    phaseList: phases.map(ph => ({ id: ph.id, name: ph.name, focus: ph.focus, weeks: ph.weeks })),
  };
}

function shapeClient(p) {
  const name = p.name || 'Client';
  const parts = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const initials = parts.map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
  const accent = CLIENT_ACCENTS[name.charCodeAt(0) % CLIENT_ACCENTS.length];
  return {
    id: p.id,
    name,
    initials,
    accent,
    email: p.email || '',
    credits: p.credits ?? 0,
    client_status: p.client_status || 'online',
    subscription_due: p.subscription_due || '',
    timezone: p.timezone || 'Europe/London',
    status: 'active',
    phaseLabel: 'No programme assigned',
    lastSeen: '—',
    streak: 0,
    prsThisWeek: 0,
    sessionsThisWeek: 0,
    sessionsTarget: 3,
  };
}

function shapeManagedClient(mc) {
  const name = mc.name || 'Client';
  const parts = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const initials = parts.map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
  const accent = CLIENT_ACCENTS[name.charCodeAt(0) % CLIENT_ACCENTS.length];
  return {
    id: mc.id, name, initials, accent,
    email: mc.email || '',
    credits: mc.credits ?? 0,
    client_status: mc.client_status || 'online',
    managed: true,
    status: 'managed',
    phaseLabel: 'Awaiting app sign-up',
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
function CoachHeader({ clientCount, pendingCount, go, unread = 0 }) {
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
          <button onClick={() => go && go('notifications')} aria-label="Notifications" className="btn-ghost" style={{ padding: 8, position: 'relative' }}>
            <IconBell size={16}/>
            {unread > 0 && (
              <span className="mono" style={{
                position: 'absolute', top: -1, right: -1, minWidth: 14, height: 14, padding: '0 3px',
                borderRadius: 999, background: 'var(--c-coral)', color: '#eceff4', fontSize: 8, fontWeight: 800,
                display: 'grid', placeItems: 'center', border: '1.5px solid var(--bg-1)',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button onClick={() => go && go('profile')} aria-label="Settings" style={{ all: 'unset', cursor: 'pointer' }}>
            <Hex size={36} style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: 'var(--on-accent)',
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 800,
            }}>HS</Hex>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="h-bold" style={{ fontSize: 24, lineHeight: 1.1 }}>
          COACH HUB
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>
          <strong style={{ color: 'var(--accent)' }}>{clientCount}</strong> client{clientCount !== 1 ? 's' : ''}
          {pendingCount > 0 && <>
            {' · '}<strong style={{ color: 'var(--c-amber)' }}>{pendingCount} awaiting sign-up</strong>
          </>}
        </div>
      </div>
    </>
  );
}

// ── KPI ROW ─────────────────────────────────────────────────────
function KPIRow({ kpis }) {
  const items = [
    { label: 'ACTIVE',    value: kpis.active,     color: 'var(--accent)',  icon: <IconUser size={11}/> },
    { label: 'TODAY',     value: kpis.today,      color: 'var(--accent-2)',icon: <IconCalendar size={11}/> },
    { label: 'SESS · 7d', value: kpis.sessions7d, color: 'var(--c-amber)', icon: <IconBolt size={11}/> },
    { label: 'PENDING',   value: kpis.pending,    color: 'var(--c-coral)', icon: <IconBell size={11}/> },
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
function ClientsTab({ clients, archived = [], loading, onPick, onInvite, onRestore, onRemove }) {
  const [q, setQ] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);

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

      {archived.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button onClick={() => setShowArchived(s => !s)} style={{
            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '6px 2px',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5"
              style={{ transform: showArchived ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
              <path d="M9 6l6 6-6 6"/>
            </svg>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.14em', fontWeight: 700 }}>
              ARCHIVED · {archived.length}
            </span>
          </button>

          {showArchived && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {archived.map(c => (
                <ArchivedClientRow key={c.id} c={c} onRestore={() => onRestore(c)} onRemove={() => onRemove(c)}/>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ArchivedClientRow({ c, onRestore, onRemove }) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const doRemove = async () => {
    setBusy(true); setErr('');
    const msg = await onRemove();
    if (msg) { setErr(msg); setBusy(false); setConfirming(false); }
    // on success the row unmounts, so no need to clear busy
  };

  return (
    <div className="card" style={{
      padding: 12, display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12,
      alignItems: 'center', opacity: busy ? 0.5 : 0.92,
    }}>
      <Hex size={36} style={{
        background: 'var(--bg-3, var(--bg-2))', color: 'var(--text-3)',
        fontFamily: 'Orbitron', fontSize: 11, fontWeight: 800,
      }}>{c.initials}</Hex>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2, var(--text))' }}>
          {c.name}
        </div>
        <div className="mono" style={{ fontSize: 10, color: err ? 'var(--c-coral)' : 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {err || c.email || 'ARCHIVED'}
        </div>
      </div>

      {confirming ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={doRemove} disabled={busy} style={{
            all: 'unset', cursor: busy ? 'default' : 'pointer', padding: '5px 9px', borderRadius: 6,
            background: 'var(--c-coral)', color: '#fff',
            fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
          }}>{busy ? '…' : 'DELETE'}</button>
          <button onClick={() => setConfirming(false)} disabled={busy} style={{
            all: 'unset', cursor: 'pointer', padding: '5px 9px', borderRadius: 6,
            background: 'var(--bg-2)', color: 'var(--text-3)',
            fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
          }}>CANCEL</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onRestore} style={{
            all: 'unset', cursor: 'pointer', padding: '5px 9px', borderRadius: 6,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
          }}>RESTORE</button>
          <button onClick={() => setConfirming(true)} style={{
            all: 'unset', cursor: 'pointer', padding: '5px 9px', borderRadius: 6,
            border: '1px solid var(--line)', color: 'var(--text-3)',
            fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
          }}>REMOVE</button>
        </div>
      )}
    </div>
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
const PROG_STATUS = [
  { id: 'active',    label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived',  label: 'Archived' },
];
function ProgrammesTab({ programmes, loading, progClients, clients, onPick, onNew, onEdit, onDuplicate, onSetStatus, onDelete }) {
  const [filter, setFilter] = React.useState('active');
  const byId = React.useMemo(() => Object.fromEntries((clients || []).map(c => [c.id, c])), [clients]);
  const counts = { active: 0, completed: 0, archived: 0 };
  programmes.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const shown = programmes.filter(p => (p.status || 'active') === filter);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="label">// PROGRAMMES</div>
        <button onClick={onNew} className="btn-ghost" style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: 10 }}>
          + NEW PROGRAMME
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {PROG_STATUS.map(s => (
          <button key={s.id} onClick={() => setFilter(s.id)} className="mono" style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8,
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
            background: filter === s.id ? 'var(--accent-soft)' : 'var(--bg-2)',
            border: `1px solid ${filter === s.id ? 'var(--accent)' : 'var(--line)'}`,
            color: filter === s.id ? 'var(--accent)' : 'var(--text-3)',
          }}>{s.label.toUpperCase()} · {counts[s.id] || 0}</button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>
          LOADING…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map(p => (
            <ProgrammeCard key={p.id} p={p}
              assigned={(progClients?.[p.id] || []).map(id => byId[id]).filter(Boolean)}
              assignedCount={(progClients?.[p.id] || []).length}
              onPick={() => onPick(p.id)}
              onEdit={() => onEdit(p)}
              onDuplicate={() => onDuplicate(p)}
              onSetStatus={(st) => onSetStatus(p.id, st)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
          {shown.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: programmes.length === 0 ? 12 : 0 }}>
                {programmes.length === 0 ? 'NO PROGRAMMES YET' : `NO ${filter.toUpperCase()} PROGRAMMES`}
              </div>
              {programmes.length === 0 && (
                <button onClick={onNew} className="btn-primary" style={{ fontSize: 11, padding: '10px 18px' }}>
                  + CREATE FIRST PROGRAMME
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ProgrammeCard({ p, assigned = [], assignedCount = 0, onPick, onEdit, onDuplicate, onSetStatus, onDelete }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const inUse = assignedCount > 0;
  const tagColor = p.tag === 'STRENGTH' ? 'var(--accent)'
                 : p.tag === 'ONBOARD'  ? 'var(--c-amber)'
                 : p.tag === 'REHAB'    ? 'var(--c-coral)'
                 :                        'var(--c-blue)';
  const statusMeta = p.status === 'completed' ? { label: 'COMPLETED', color: 'var(--c-blue)' }
                   : p.status === 'archived'  ? { label: 'ARCHIVED',  color: 'var(--text-3)' }
                   :                            { label: 'ACTIVE',     color: 'var(--accent)' };
  const statusActions = p.status === 'active'    ? [['completed', 'MARK COMPLETED'], ['archived', 'ARCHIVE']]
                      : p.status === 'completed' ? [['active', 'REOPEN (ACTIVE)'], ['archived', 'ARCHIVE']]
                      :                            [['active', 'RESTORE (ACTIVE)']];
  return (
    <div style={{ position: 'relative', opacity: p.status === 'archived' ? 0.72 : 1 }}>
      <button onClick={onPick} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box' }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <span className="chip" style={{ fontSize: 8, padding: '2px 6px', color: tagColor, borderColor: 'currentColor' }}>{p.tag}</span>
                <span className="mono" style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 999, color: statusMeta.color, background: `color-mix(in srgb, ${statusMeta.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusMeta.color} 35%, transparent)` }}>{statusMeta.label}</span>
                {inUse && (
                  <span className="mono" style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 999, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }}>● LIVE · IN USE</span>
                )}
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
                  {p.weeks} WK · {p.phases} PHASE{p.phases !== 1 ? 'S' : ''}
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, paddingRight: 30 }}>{p.name}</div>
            </div>
          </div>

          {/* Assigned clients at a glance */}
          {inUse && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex' }}>
                {assigned.slice(0, 5).map((c, i) => (
                  <div key={c.id} title={c.name} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }}>
                    <Hex size={24} style={{ background: c.accent, color: 'var(--on-accent)', fontFamily: 'Orbitron', fontSize: 8, fontWeight: 800, boxShadow: '0 0 0 2px var(--bg-2)' }}>{c.initials}</Hex>
                  </div>
                ))}
                {assigned.length > 5 && (
                  <div style={{ marginLeft: -8 }}><Hex size={24} style={{ background: 'var(--bg-3)', color: 'var(--text-2)', fontFamily: 'JetBrains Mono', fontSize: 8, fontWeight: 700, boxShadow: '0 0 0 2px var(--bg-2)' }}>+{assigned.length - 5}</Hex></div>
                )}
              </div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 700 }}>
                {assignedCount} CLIENT{assignedCount !== 1 ? 'S' : ''}{assigned.length < assignedCount ? ' ASSIGNED' : ''}
              </span>
            </div>
          )}

          {p.phaseList.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.phaseList.length}, 1fr)`, gap: 4, marginBottom: 8 }}>
              {p.phaseList.map((ph, i) => (
                <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
                  <div className="mono" style={{ fontSize: 8, color: tagColor, letterSpacing: '0.1em', fontWeight: 600 }}>P{i+1} · {ph.weeks}W</div>
                  <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.name}</div>
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

      {/* Three-dot menu */}
      <button onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); setConfirmDel(false); }} style={{
        position: 'absolute', top: 10, right: 10,
        all: 'unset', cursor: 'pointer',
        width: 28, height: 28, borderRadius: 6, zIndex: 2,
        background: menuOpen ? 'var(--bg-3)' : 'transparent',
        border: menuOpen ? '1px solid var(--line-strong)' : '1px solid transparent',
        display: 'grid', placeItems: 'center',
        color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 14, letterSpacing: '0.05em',
      }}>···</button>

      {menuOpen && (
        <>
          <div onClick={() => { setMenuOpen(false); setConfirmDel(false); }} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', top: 42, right: 8, zIndex: 21,
            minWidth: 160, background: 'var(--bg-3)',
            border: '1px solid var(--line-strong)', borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {[
              { label: 'EDIT', fn: () => { onEdit(); setMenuOpen(false); } },
              { label: 'DUPLICATE', fn: () => { onDuplicate(); setMenuOpen(false); } },
              ...statusActions.map(([st, label]) => ({ label, fn: () => { onSetStatus(st); setMenuOpen(false); } })),
            ].map(item => (
              <button key={item.label} onClick={item.fn} style={{
                all: 'unset', cursor: 'pointer', display: 'block',
                padding: '9px 12px', borderRadius: 7,
                fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--text)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{item.label}</button>
            ))}
            <div style={{ height: 1, background: 'var(--line)', margin: '2px 4px' }} />
            <button onClick={() => {
              if (!confirmDel) { setConfirmDel(true); return; }
              onDelete(); setMenuOpen(false); setConfirmDel(false);
            }} style={{
              all: 'unset', cursor: 'pointer', display: 'block',
              padding: '9px 12px', borderRadius: 7,
              fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--c-coral)',
              background: confirmDel ? 'color-mix(in srgb, var(--c-coral) 14%, transparent)' : 'transparent',
            }}>{confirmDel ? 'CONFIRM DELETE' : 'DELETE'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── AD-HOC WORKOUTS TAB ─────────────────────────────────────────
function AdhocTab({ workouts, loading, clients, trainerId, onNew, onEdit, onDuplicate, onDelete }) {
  const [assignTo, setAssignTo] = React.useState(null); // the workout being assigned
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="label">// AD-HOC WORKOUTS · {loading ? '…' : workouts.length}</div>
        <button onClick={onNew} className="btn-ghost" style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: 10 }}>
          + NEW WORKOUT
        </button>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 12 }}>
        One-off sessions you can assign to any client on any date — no phases or weeks. Great for trials, makeup sessions or testing days.
      </div>
      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>LOADING…</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {workouts.map(w => (
            <AdhocCard key={w.id} w={w}
              onEdit={() => onEdit(w)} onAssign={() => setAssignTo(w)}
              onDuplicate={() => onDuplicate(w)} onDelete={() => onDelete(w.id)}/>
          ))}
          {workouts.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>NO AD-HOC WORKOUTS YET</div>
              <button onClick={onNew} className="btn-primary" style={{ fontSize: 11, padding: '10px 18px' }}>+ CREATE A WORKOUT</button>
            </div>
          )}
        </div>
      )}

      {assignTo && (
        <AssignAdhocSheet workout={assignTo} clients={clients} trainerId={trainerId} onClose={() => setAssignTo(null)}/>
      )}
    </>
  );
}

function AdhocCard({ w, onEdit, onAssign, onDuplicate, onDelete }) {
  const [confirmDel, setConfirmDel] = React.useState(false);
  const tagColor = TAG_COLOR(w.tag);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="chip" style={{ fontSize: 8, padding: '2px 6px', color: tagColor, borderColor: 'currentColor' }}>{w.tag}</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>SINGLE SESSION</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{w.name}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onAssign} className="btn-primary" style={{ flex: 1, fontSize: 10, padding: '9px 0', color: 'var(--heading-deep)' }}>ASSIGN</button>
        <button onClick={onEdit} className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: '9px 0' }}>EDIT</button>
        <button onClick={onDuplicate} className="btn-ghost" style={{ fontSize: 10, padding: '9px 11px' }}>DUPLICATE</button>
        <button onClick={() => { if (!confirmDel) { setConfirmDel(true); return; } onDelete(); }}
          className="btn-ghost" style={{ fontSize: 10, padding: '9px 11px', borderColor: confirmDel ? 'var(--c-coral)' : 'var(--line-strong)', color: 'var(--c-coral)' }}>
          {confirmDel ? 'CONFIRM' : 'DELETE'}
        </button>
      </div>
    </div>
  );
}

function TAG_COLOR(tag) {
  return tag === 'STRENGTH' ? 'var(--accent)' : tag === 'ONBOARD' ? 'var(--c-amber)' : tag === 'REHAB' ? 'var(--c-coral)' : 'var(--c-blue)';
}

// Assign a one-off workout to a client on a date.
function AssignAdhocSheet({ workout, clients, trainerId, onClose }) {
  const [dayId, setDayId]   = React.useState(undefined); // undefined=loading, null=none
  const [clientId, setClientId] = React.useState('');
  const [date, setDate]     = React.useState(() => new Date().toISOString().slice(0, 10));
  const [q, setQ]           = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [done, setDone]     = React.useState(false);

  React.useEffect(() => {
    const phaseId = workout.phaseList?.[0]?.id;
    if (!phaseId) { setDayId(null); return; }
    supabase.from('programme_days').select('id').eq('phase_id', phaseId).order('week_index').order('day_of_week').limit(1).maybeSingle()
      .then(({ data }) => setDayId(data?.id || null));
  }, [workout.id]);

  const filtered = (clients || []).filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  const selected = clients?.find(c => c.id === clientId);

  const assign = async () => {
    if (!clientId || !dayId || !date || saving) return;
    setSaving(true);
    await supabase.from('client_workouts').insert({ client_id: clientId, trainer_id: trainerId, day_id: dayId, scheduled_date: date });
    if (selected && !selected.managed) {
      notify({ recipientId: clientId, actorId: trainerId, kind: 'task', title: 'New workout assigned', body: workout.name, link: { screen: 'workouts' } });
    }
    setSaving(false); setDone(true);
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div className="label" style={{ marginBottom: 4 }}>// ASSIGN WORKOUT</div>
        <div className="h-bold" style={{ fontSize: 20 }}>{workout.name.toUpperCase()}</div>
      </div>

      {done ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 30, color: 'var(--accent)', marginBottom: 10 }}>✓</div>
            <div className="h-bold" style={{ fontSize: 16, marginBottom: 6 }}>WORKOUT ASSIGNED</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
              {selected?.name?.toUpperCase()} · {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
            </div>
            <button onClick={onClose} className="btn-primary" style={{ width: 200 }}>DONE</button>
          </div>
        </div>
      ) : (
        <div className="scroller" style={{ flex: 1, padding: '16px 18px', minHeight: 0, display: 'grid', gap: 14, alignContent: 'start' }}>
          {dayId === null && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--c-amber)', padding: '10px 12px', background: 'color-mix(in srgb, var(--c-amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-amber) 35%, transparent)', borderRadius: 8, lineHeight: 1.6 }}>
              This workout has no session built yet — open it in EDIT and add some exercises first.
            </div>
          )}
          <div>
            <div className="label" style={{ marginBottom: 7 }}>// CLIENT</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ ...inviteInputSt, marginBottom: 8 }}/>
            <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {filtered.map(c => (
                <button key={c.id} onClick={() => setClientId(c.id)} style={{
                  all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10,
                  background: clientId === c.id ? 'var(--accent-soft)' : 'var(--bg-2)',
                  border: `1px solid ${clientId === c.id ? 'var(--accent)' : 'var(--line)'}`,
                }}>
                  <Hex size={28} style={{ background: c.accent, color: 'var(--on-accent)', fontFamily: 'Orbitron', fontSize: 9, fontWeight: 800 }}>{c.initials}</Hex>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: clientId === c.id ? 'var(--accent)' : 'var(--text)' }}>{c.name}</span>
                  {c.managed && <span className="mono" style={{ fontSize: 8, color: 'var(--c-amber)', fontWeight: 700 }}>PENDING</span>}
                  {clientId === c.id && <IconCheck size={13} style={{ color: 'var(--accent)' }}/>}
                </button>
              ))}
              {filtered.length === 0 && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', padding: '8px 2px' }}>No clients match.</div>}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 7 }}>// DATE</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inviteInputSt, appearance: 'auto' }}/>
          </div>
        </div>
      )}

      {!done && (
        <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <button onClick={assign} disabled={!clientId || !dayId || !date || saving} className="btn-primary"
            style={{ width: '100%', opacity: clientId && dayId && date ? 1 : 0.4, pointerEvents: clientId && dayId && date ? 'auto' : 'none' }}>
            {saving ? 'ASSIGNING…' : 'ASSIGN WORKOUT →'}
          </button>
        </div>
      )}
    </SheetShell>
  );
}

// ── TASK TEMPLATES TAB ──────────────────────────────────────────
const TT_KINDS = ['check', 'log', 'photo', 'form'];
const TT_COLOR = { check: 'var(--accent)', log: 'var(--c-amber)', photo: 'var(--c-blue)', form: 'var(--c-pink)' };
function TaskTemplatesTab({ trainerId }) {
  const [templates, setTemplates] = React.useState(null);
  const [forms, setForms] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState('check');
  const [formId, setFormId] = React.useState('');
  const [due, setDue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const reload = () => supabase.from('task_templates').select('*').eq('trainer_id', trainerId)
    .order('sort_order').order('created_at').then(({ data }) => setTemplates(data || []));
  React.useEffect(() => { reload(); loadForms().then(setForms); }, [trainerId]);

  const selForm = forms.find(f => f.id === formId);
  const effTitle = (title.trim() || (kind === 'form' && selForm ? selForm.title : '')).trim();
  const canSave = !!effTitle && !saving && (kind !== 'form' || !!formId);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    await supabase.from('task_templates').insert({
      trainer_id: trainerId, title: effTitle, kind, form_id: kind === 'form' ? formId : null,
      due_date: due || null, sort_order: (templates?.length || 0),
    });
    setSaving(false); setAdding(false); setTitle(''); setKind('check'); setFormId(''); setDue(''); reload();
  };

  const del = async (id) => { await supabase.from('task_templates').delete().eq('id', id); reload(); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="label">// TASK TEMPLATES · {templates === null ? '…' : templates.length}</div>
        <button onClick={() => setAdding(a => !a)} className="btn-ghost" style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: 10 }}>
          + NEW TEMPLATE
        </button>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 12 }}>
        Reusable tasks and form assignments. Pick one in a client's Tasks tab to assign it in a tap.
      </div>

      {adding && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10, marginBottom: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>TASK TITLE</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Log today's weight" style={ttInputSt}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>TYPE</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {TT_KINDS.map(k => {
                  const col = TT_COLOR[k];
                  return (
                    <button key={k} onClick={() => setKind(k)} style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 7,
                      fontSize: 8.5, fontFamily: 'JetBrains Mono', fontWeight: 700,
                      background: kind === k ? `color-mix(in srgb, ${col} 16%, transparent)` : 'var(--bg-3)',
                      border: `1px solid ${kind === k ? col : 'var(--line)'}`,
                      color: kind === k ? col : 'var(--text-3)',
                    }}>{k.toUpperCase()}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>DUE DATE (OPT)</div>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...ttInputSt, appearance: 'auto' }}/>
            </div>
          </div>
          {kind === 'form' && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>FORM</div>
              <select value={formId} onChange={e => setFormId(e.target.value)} style={{ ...ttInputSt, appearance: 'auto' }}>
                <option value="">— Select a form —</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </div>
          )}
          <button onClick={save} disabled={!canSave} className="btn-primary" style={{ opacity: canSave ? 1 : 0.4 }}>
            {saving ? 'SAVING…' : 'SAVE TEMPLATE'}
          </button>
        </div>
      )}

      {templates === null ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>LOADING…</div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em' }}>NO TEMPLATES YET</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {templates.map(t => {
            const col = TT_COLOR[t.kind] || 'var(--accent)';
            return (
              <div key={t.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `2px solid ${col}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div className="mono" style={{ fontSize: 9, color: col, marginTop: 2, letterSpacing: '0.08em', fontWeight: 700 }}>
                    {t.kind.toUpperCase()}<span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{t.due_date ? ` · DUE ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>
                  </div>
                </div>
                <button onClick={() => del(t.id)} aria-label="Delete template" style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><IconX2 size={13}/></button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const ttInputSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12,
};

// ── SCHEDULE TAB ────────────────────────────────────────────────
function ScheduleTab({ schedule, clients, onPick }) {
  if (schedule === null) return (
    <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>
      LOADING…
    </div>
  );

  const doneCount = schedule.filter(s => s.status === 'completed').length;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div className="label">// TODAY · {schedule.length} WORKOUT{schedule.length !== 1 ? 'S' : ''}</div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
          {doneCount}/{schedule.length} DONE
        </span>
      </div>

      {schedule.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
            NOTHING SCHEDULED TODAY<br/>
            <span style={{ fontSize: 9 }}>Assign workouts from a client's Training tab</span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {schedule.map(s => <ScheduleRow key={s.id} s={s} client={clients.find(c => c.id === s.client_id)} onPick={onPick}/>)}
      </div>
    </>
  );
}

function ScheduleRow({ s, client, onPick }) {
  const done = s.status === 'completed';
  const phase = s.programme_days?.programme_phases;
  const label = [phase?.programmes?.name, phase?.name].filter(Boolean).join(' · ') || 'Assigned workout';

  return (
    <button onClick={client ? () => onPick(client.id) : undefined} style={{ all: 'unset', cursor: client ? 'pointer' : 'default', display: 'block' }}>
      <div className="card" style={{
        padding: 12, display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center',
        opacity: done ? 0.65 : 1,
        borderLeft: `2px solid ${done ? 'var(--accent)' : 'var(--c-amber)'}`,
      }}>
        <Hex size={32} style={{
          background: client?.accent || 'var(--bg-3)', color: 'var(--on-accent)',
          fontFamily: 'Orbitron', fontSize: 10, fontWeight: 800,
        }}>{client?.initials || '?'}</Hex>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {client?.name || 'Client'}
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label.toUpperCase()}
          </div>
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '0.1em', color: done ? 'var(--accent)' : 'var(--c-amber)' }}>
          {done ? '✓ DONE' : '○ SCHEDULED'}
        </span>
      </div>
    </button>
  );
}

// ── INVITE SHEET ────────────────────────────────────────────────
function InviteSheet({ trainerId, onClose, onCreated }) {
  const [clientName,  setClientName]  = React.useState('');
  const [clientEmail, setClientEmail] = React.useState('');
  const [saving,      setSaving]      = React.useState(false);
  const [inviteUrl,   setInviteUrl]   = React.useState(null);
  const [emailed,     setEmailed]     = React.useState(false);
  const [copied,      setCopied]      = React.useState(false);
  const [error,       setError]       = React.useState(null);

  const create = async () => {
    if (!clientName.trim() || saving) return;
    setSaving(true);
    setError(null);

    // Create the managed client row so the trainer can work with them immediately
    const { data: mc, error: mcErr } = await supabase
      .from('managed_clients')
      .insert({ trainer_id: trainerId, name: clientName.trim(), email: clientEmail.trim() })
      .select('id')
      .single();
    if (mcErr || !mc) { setSaving(false); setError(mcErr?.message || 'Could not add client'); return; }

    // Create an invite linked to this managed client (for the client to sign up later)
    const { data: invite, error: invErr } = await supabase
      .from('invites')
      .insert({ trainer_id: trainerId, client_name: clientName.trim(), client_email: clientEmail.trim(), managed_client_id: mc.id })
      .select('code')
      .single();
    if (invErr || !invite) { setSaving(false); setError(invErr?.message || 'Could not create invite link'); return; }

    const url = `${window.location.origin}?invite=${invite.code}&tid=${trainerId}&mc=${mc.id}&name=${encodeURIComponent(clientName.trim())}`;
    setInviteUrl(url);

    // If an email was given, send a Supabase Auth invite email via the edge function.
    if (clientEmail.trim()) {
      const { data, error: fnErr } = await supabase.functions.invoke('invite-client', {
        body: { email: clientEmail.trim(), name: clientName.trim(), managedClientId: mc.id, redirectTo: window.location.origin },
      });
      if (!fnErr && !data?.error) setEmailed(true);
      else setError('Client added, but the invite email couldn’t be sent — share the link below instead.');
    }

    setSaving(false);
    onCreated?.();
  };

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const emailInvite = () => {
    const subject = encodeURIComponent('Your training app invite');
    const body = encodeURIComponent(`Hi ${clientName.trim()},\n\nHere's your link to join and set up your account:\n${inviteUrl}\n\nSee you in there!`);
    const to = clientEmail.trim();
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
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
              Add an email and we'll send them an invite to join — they set a password and connect to you automatically. You'll also get a one-time link to share manually if you prefer.
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--accent)', filter: 'drop-shadow(0 0 calc(10px * var(--glow)) var(--accent-glow))' }}>✓</div>
              <div className="h-bold" style={{ fontSize: 16, color: 'var(--accent)', marginBottom: 4 }}>INVITE CREATED</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>FOR {clientName.toUpperCase()}</div>
            </div>
            {emailed && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', padding: '10px 12px', background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', borderRadius: 8, letterSpacing: '0.04em', lineHeight: 1.6, textAlign: 'center' }}>
                ✉ INVITE EMAILED TO {clientEmail.trim().toUpperCase()}<br/>
                <span style={{ color: 'var(--text-3)' }}>They'll tap the link, set a password and connect to you automatically.</span>
              </div>
            )}
            {error && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--c-amber)', padding: '10px 12px', background: 'color-mix(in srgb, var(--c-amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-amber) 35%, transparent)', borderRadius: 8, letterSpacing: '0.04em', lineHeight: 1.6 }}>
                {error}
              </div>
            )}
            {/* Manual link is the fallback — only when no invite email was sent,
                so a given email has exactly one onboarding route (no duplicates). */}
            {!emailed && (
              <>
                <div>
                  <div className="label" style={{ marginBottom: 7 }}>// INVITE LINK</div>
                  <div style={{
                    padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                    borderRadius: 10, wordBreak: 'break-all',
                    fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-2)', lineHeight: 1.7,
                  }}>{inviteUrl}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={copy} className={copied ? 'btn-primary' : 'btn-ghost'} style={{ flex: 1 }}>
                    {copied ? '✓ COPIED' : '⎘ COPY LINK'}
                  </button>
                  {clientEmail.trim() && (
                    <button onClick={emailInvite} className="btn-ghost" style={{ flex: 1 }}>✉ EMAIL INVITE</button>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
                  Share this link — they'll create their account and connect to you automatically.
                </div>
              </>
            )}
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
        </div>
        {children}
      </div>
    </div>
  );
}
