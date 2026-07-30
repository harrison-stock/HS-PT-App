import { supabase } from './supabase'

// Insert a notification for the counterparty. Best-effort: failures (e.g. no
// trainer linked) are swallowed so they never block the triggering action.
export async function notify({ recipientId, actorId, kind, title, body, link }) {
  if (!recipientId || !actorId || recipientId === actorId) return;
  try {
    await supabase.from('notifications').insert({
      recipient_id: recipientId, actor_id: actorId, kind,
      title: title || '', body: body || '', link: link || null,
    });
  } catch (e) { /* ignore */ }
}

// The trainer a given user reports to (null for trainers / unlinked).
export async function trainerOf(userId) {
  const { data } = await supabase.from('profiles').select('trainer_id').eq('id', userId).maybeSingle();
  return data?.trainer_id || null;
}

// Who did it matters more than what happened - "Injury reported" is useless
// without a name against it. Resolved by joining the actor at read time rather
// than baked into the body at write time, so notifications already in the table
// gain a name too.
export async function loadNotifications(userId) {
  const q = () => supabase.from('notifications')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false }).limit(50);
  let { data, error } = await q().select('*, actor:profiles!actor_id ( name )');
  // Older databases may not expose the embed; the list is still worth showing.
  if (error) ({ data } = await q().select('*'));
  return (data || []).map(n => ({ ...n, actorName: n.actor?.name || '' }));
}

export async function unreadCount(userId) {
  const { count } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId).is('read_at', null);
  return count || 0;
}

export async function markAllRead(userId) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId).is('read_at', null);
}

export async function markRead(id) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

// Subscribe to inserts for a user; calls onInsert(row). Returns an unsubscribe.
export function subscribeNotifications(userId, onInsert) {
  const ch = supabase
    .channel(`notif-${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// Fire an OS/browser notification if the user granted permission (works while
// the tab is open; full background push would need a service worker + sender).
export function maybeBrowserNotify(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body });
  } catch (e) { /* ignore */ }
}

export function requestNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) { /* ignore */ }
}
