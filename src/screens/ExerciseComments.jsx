import React from 'react'
import { supabase } from '../lib/supabase'
import { IconCheck } from '../components/icons'
import { notify, trainerOf } from '../lib/notifications'
import { Skel } from '../components/Loading'

// A comment thread against one exercise, in one session.
//
// It used to gather every comment on a movement by name, so bench press across
// eight weeks arrived as one undated conversation - and the only date on screen
// was when each message was typed. "Elbows drifting on set 3" tells you nothing
// if you can't see which session it was watching.
//
// So THIS SESSION leads: the comments on this exercise, in this workout, with
// the workout and date named at the top. The movement's whole history is still
// a tap away under ALL SESSIONS, because a coach picking up "your shoulder
// clicked on this last month" is exactly why it was written that way to begin
// with. There, each comment carries the session it belongs to.
const fmtDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

// What the comment was about, preferring the session it was left on and falling
// back to the day it was written for anything older than that column.
const contextOf = (c) => {
  const day = fmtDate(c.scheduled_date);
  const workout = c.section_exercises?.workout_sections?.programme_days?.title;
  if (day && workout) return `${workout.toUpperCase()} · ${day.toUpperCase()}`;
  if (day) return day.toUpperCase();
  return null;
};

export function ExerciseComments({ exerciseId, clientId, exerciseName, scheduledDate, workoutName, onClose }) {
  const [me, setMe] = React.useState(null);
  const [view, setView] = React.useState('session');
  const [rows, setRows] = React.useState(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [names, setNames] = React.useState({});

  const SELECT = '*, section_exercises ( name, workout_sections ( programme_days ( title ) ) )';

  const reload = React.useCallback(async () => {
    setRows(null);
    if (view === 'movement' && exerciseName) {
      // Every session this movement appears in, for this client.
      const { data, error } = await supabase.from('exercise_comments')
        .select('*, section_exercises!inner ( name, workout_sections ( programme_days ( title ) ) )')
        .eq('client_id', clientId)
        .ilike('section_exercises.name', String(exerciseName).trim())
        .order('created_at', { ascending: true });
      if (!error) { setRows(data || []); return; }
    }
    // This exercise, in this workout. The id is the client's own copy, so it is
    // already scoped to one movement inside one session's worth of work.
    const { data } = await supabase.from('exercise_comments').select(SELECT)
      .eq('exercise_id', exerciseId).eq('client_id', clientId)
      .order('created_at', { ascending: true });
    setRows(data || []);
  }, [exerciseId, clientId, exerciseName, view]);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data?.user?.id || null));
    reload();
  }, [reload]);

  // Put a name against each author - "COACH/CLIENT" told you nothing.
  React.useEffect(() => {
    const ids = [...new Set((rows || []).map(r => r.author_id).filter(Boolean))];
    if (!ids.length) return;
    supabase.from('profiles').select('id, name').in('id', ids)
      .then(({ data }) => setNames(Object.fromEntries((data || []).map(p => [p.id, p.name || 'Them']))));
  }, [rows]);

  const send = async () => {
    if (!text.trim() || busy || !me) return;
    setBusy(true);
    await supabase.from('exercise_comments').insert({
      exercise_id: exerciseId, client_id: clientId, author_id: me, body: text.trim(),
      // The session this is about. Given by the caller where it knows the date
      // exactly; today otherwise, which is the session being logged.
      scheduled_date: scheduledDate || new Date().toISOString().slice(0, 10),
    });
    const recipient = me === clientId ? await trainerOf(clientId) : clientId;
    if (recipient) notify({
      recipientId: recipient, actorId: me, kind: 'comment',
      title: `Comment on ${exerciseName || 'an exercise'}`,
      body: text.trim().slice(0, 80),
      link: me === clientId
        ? { screen: 'coach', clientId, tab: 'training', exerciseId, exercise: exerciseName || '' }
        : { screen: 'workouts', exerciseId, exercise: exerciseName || '' },
    });
    setText(''); setBusy(false);
    // A comment written here belongs to this session, so show it there.
    if (view !== 'session') setView('session'); else reload();
  };

  const sessionLabel = [workoutName, fmtDate(scheduledDate)].filter(Boolean).join(' · ');

  const tab = (id, label) => (
    <button onClick={() => setView(id)} className="mono" style={{
      all: 'unset', cursor: 'pointer', padding: '5px 11px', borderRadius: 999,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      background: view === id ? 'var(--accent-soft)' : 'transparent',
      border: `1px solid ${view === id ? 'var(--accent)' : 'var(--line)'}`,
      color: view === id ? 'var(--accent)' : 'var(--text-3)',
    }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '80%', background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--line-strong)', borderBottom: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }} />
          <div className="label">// COMMENTS</div>
          <div className="h-bold" style={{ fontSize: 16, marginTop: 4 }}>{exerciseName || 'EXERCISE'}</div>
          {sessionLabel && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginTop: 4 }}>
              {sessionLabel.toUpperCase()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {tab('session', 'THIS SESSION')}
            {tab('movement', 'ALL SESSIONS')}
          </div>
        </div>
        <div className="scroller" style={{ height: 'auto', flex: 1, padding: '8px 16px', minHeight: 80, display: 'grid', gap: 8, alignContent: 'start' }}>
          {rows === null && <><Skel w="70%" h={30} r={12} /><Skel w="55%" h={30} r={12} style={{ justifySelf: 'end' }} /></>}
          {rows && rows.length === 0 && (
            <Mono>{view === 'session'
              ? 'Nothing on this exercise yet - start the conversation.'
              : 'No comments on this movement yet.'}</Mono>
          )}
          {(rows || []).map(c => {
            const mine = c.author_id === me;
            // In the movement view a comment could be from any week, so it says
            // which. In the session view they are all this session by definition.
            const ctx = view === 'movement' ? contextOf(c) : null;
            return (
              <div key={c.id} style={{ justifySelf: mine ? 'end' : 'start', maxWidth: '85%' }}>
                {ctx && (
                  <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 3, textAlign: mine ? 'right' : 'left' }}>
                    {ctx}
                  </div>
                )}
                <div style={{
                  padding: '9px 12px', borderRadius: 12,
                  background: mine ? 'var(--accent-soft)' : 'var(--bg-3)',
                  border: `1px solid ${mine ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--line)'}`,
                  color: 'var(--text)', fontSize: 13, lineHeight: 1.45,
                }}>{c.body}</div>
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                  {mine ? 'YOU' : (names[c.author_id] || 'THEM').toUpperCase()} · {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '10px 16px 24px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={1} placeholder="Write a comment…"
            style={{ flex: 1, boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 13, resize: 'none' }}/>
          <button onClick={send} disabled={!text.trim() || busy} className="btn-primary" style={{ padding: '10px 14px', opacity: text.trim() ? 1 : 0.4 }}>
            <IconCheck size={14} sw={3}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function Mono({ children }) {
  return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textAlign: 'center', padding: 12 }}>{children}</div>;
}
