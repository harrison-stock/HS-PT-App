import { supabase } from './supabase'

// Web push, client half: ask for permission, get a subscription from the
// browser's push service, and keep it in the database so the sender can reach
// this device later.
//
// The whole feature is dormant without a VAPID public key. That's deliberate -
// the key is generated once and pasted into the environment, and until it is,
// every entry point here reports "not configured" rather than throwing.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export const pushConfigured = () => !!VAPID_PUBLIC;

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

// iOS grants push only to a home-screen install. Worth saying out loud, because
// in Safari the permission prompt never appears and there is nothing to see.
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Why push can't be turned on here, or null if it can.
export function pushBlockedReason() {
  if (!pushSupported()) return 'This browser does not support notifications.';
  if (isIOS() && !isStandalone()) return 'On iPhone, add the app to your home screen first — Safari only allows notifications for installed apps.';
  if (!pushConfigured()) return 'Notifications are not configured on this deployment yet.';
  if (Notification.permission === 'denied') return 'Notifications are blocked for this app in your device settings.';
  return null;
}

// VAPID keys travel as base64url; PushManager wants raw bytes.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToBase64(sub, name) {
  const key = sub.getKey(name);
  if (!key) return null;
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch (e) { return null; }
}

export async function isPushEnabled() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  return !!(await currentSubscription());
}

// Must be called from a user gesture - browsers refuse a permission prompt
// raised any other way, and iOS refuses it silently.
export async function enablePush(userId) {
  const blocked = pushBlockedReason();
  if (blocked) return { error: blocked };
  if (!userId) return { error: 'Not signed in.' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'Permission was not granted.' };

    const reg = await navigator.serviceWorker.ready;
    // Re-use an existing subscription rather than minting a second one for the
    // same install; the endpoint would be identical anyway.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const p256dh = keyToBase64(sub, 'p256dh');
    const auth = keyToBase64(sub, 'auth');
    if (!p256dh || !auth) return { error: 'The browser returned an unusable subscription.' };

    // endpoint is unique, so re-enabling on a device already known updates the
    // row rather than piling up duplicates that all deliver to one phone.
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId, endpoint: sub.endpoint, p256dh, auth,
      user_agent: navigator.userAgent.slice(0, 300),
    }, { onConflict: 'endpoint' });
    if (error) return { error: 'Could not save this device. Is the database migration applied?' };

    return { ok: true };
  } catch (e) {
    return { error: e?.message || 'Could not turn notifications on.' };
  }
}

// Unsubscribe this device. Permission itself is the OS's to revoke - all we can
// do is stop sending, and say so honestly in the UI.
export async function disablePush() {
  try {
    const sub = await currentSubscription();
    if (!sub) return { ok: true };
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
    return { ok: true };
  } catch (e) {
    return { error: e?.message || 'Could not turn notifications off.' };
  }
}

// Ask the server to push to someone. Best-effort by design: a failure here must
// never take down the action that triggered it - assigning a task still worked
// even if the phone never buzzed.
export async function sendPush({ recipientId, title, body, link, tag }) {
  if (!recipientId || !pushConfigured()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ recipientId, title, body, link, tag }),
    });
  } catch (e) { /* ignore */ }
}

// Show a notification from the page itself. Used for the rest timer, which is
// a local deadline the server knows nothing about. Goes through the service
// worker registration where possible so it behaves like a real notification
// (and works on Android when the page is hidden) rather than a page-owned one.
export async function showLocalNotification(title, options = {}) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        icon: '/web-app-manifest-192x192.png', badge: '/favicon-96x96.png',
        vibrate: [120, 60, 120], ...options,
      });
      return true;
    }
    new Notification(title, options);
    return true;
  } catch (e) { return false; }
}
