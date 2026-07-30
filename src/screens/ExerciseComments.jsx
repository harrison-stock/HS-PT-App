import React from 'react'
import { supabase } from '../lib/supabase'
import { Hex } from '../components/hex'
import { IconCheck } from '../components/icons'
import { notify, trainerOf } from '../lib/notifications'
import { Skel } from '../components/Loading'

// A comment thread for one exercise (per client). Both the client and their
// coach can post; each post notifies the other party.
export function ExerciseComments({ exerciseId, clientId, exerciseName, onClose }) {
  const [me, setMe] = React.useState(null);
  const [rows, setRows] = React.useState(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [names, setNames] = React.useState({});

  const reload = React.useCallback(async () => {
    // Comments are stored against a prescribed exercise - one row per programme
    // day - so a thread keyed on that id splits the conversation across every
    // week the movement appears. Gather by movement name instead, which is how
    // logged history is matched everywhere else.
    if (exerciseName) {
      const quoted = `"${String(exerciseName).trim().replace(/"/g, '\\"')}"`;
      const { data, error } = await supabase.from('exercise_comments')
        .select('*, section_exercises!inner ( name )')
        .eq('client_id', clientId)
        .ilike('section_exercises.name', quoted)
        .order('created_at', { ascending: true });
      if (!error) { setRows(data || []); return; }
    }
    const { data } = await supabase.from('exercise_comments').select('*')
      .eq('exercise_id', exerciseId).eq('client_id', clientId)
      .order('created_at', { ascending: true });
    setRows(data || []);
  }, [exerciseId, clientId, exerciseName]);

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
    await supabase.from('exercise_comments').insert({ exercise_id: exerciseId, client_id: clientId, author_id: me, body: text.trim() });
    // Notify the other party.
    const recipient = me === clientId ? await trainerOf(clientId) : clientId;
    if (recipient) notify({
      recipientId: recipient, actorId: me, kind: 'comment',
      title: `Comment on ${exerciseName || 'an exercise'}`,
      body: text.trim().slice(0, 80),
      // Open this movement's thread, rather than dropping the coach on the hub.
      link: me === clientId
        ? { screen: 'coach', clientId, tab: 'training', exerciseId, exercise: exerciseName || '' }
        : { screen: 'workouts', exerciseId, exercise: exerciseName || '' },
    });
    setText(''); setBusy(false); reload();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '80%', background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--line-strong)', borderBottom: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px 8px' }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }} />
          <div className="label">// COMMENTS</div>
          <div className="h-bold" style={{ fontSize: 16, marginTop: 4 }}>{exerciseName || 'EXERCISE'}</div>
        </div>
        <div className="scroller" style={{ height: 'auto', flex: 1, padding: '8px 16px', minHeight: 80, display: 'grid', gap: 8, alignContent: 'start' }}>
          {rows === null && <><Skel w="70%" h={30} r={12} /><Skel w="55%" h={30} r={12} style={{ justifySelf: 'end' }} /></>}
          {rows && rows.length === 0 && <Mono>No comments yet - start the conversation.</Mono>}
          {(rows || []).map(c => {
            const mine = c.author_id === me;
            return (
              <div key={c.id} style={{ justifySelf: mine ? 'end' : 'start', maxWidth: '85%' }}>
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
        <div style={{ padding: '10px 16px 24px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
