import { supabase } from './supabase'

// What we ask, in the words we ask it.
//
// The version is bumped whenever the wording changes in a way that alters what
// someone agreed to - fixing a typo doesn't, adding a purpose does. Clients on
// an older version are asked again, because consent is to a particular thing
// said in a particular way, and silently carrying it forward onto new wording
// is how consent stops meaning anything.
//
// Keep the text here plain. It is read by someone about to tell their trainer
// about an old knee injury, not by a lawyer, and "we process special category
// data pursuant to Article 9(2)(a)" tells them nothing they can act on.
export const CONSENT_VERSION = '2026-09-1';

export const CONSENT_PURPOSES = [
  {
    id: 'health_core',
    required: true,
    title: 'Injuries, health notes and measurements',
    wording:
      'I agree that my coach can record and use health information about me - injuries, ' +
      'anything medical I tell them that affects my training, and body measurements like ' +
      'weight and waist - so they can write me a programme that is safe for my body.',
    // Said plainly, because it is the honest position and because pretending
    // otherwise would make the consent worse rather than better.
    note: 'This one is needed to coach you. Without it there is no safe way to write you a programme.',
  },
  {
    id: 'photos',
    required: false,
    title: 'Progress photographs',
    wording:
      'I agree that my coach can store progress photographs of me, and I understand I can ' +
      'stop this at any time and ask for the photos to be deleted.',
    note: 'Optional. Say no and everything else works exactly the same - you just will not be able to upload photos.',
  },
  {
    id: 'wearables',
    required: false,
    title: 'Data from a watch or fitness tracker',
    wording:
      'I agree that if I connect a watch or fitness tracker, my daily steps, resting heart ' +
      'rate and weight readings can be sent to this app and seen by my coach.',
    note: 'Optional, and only does anything if you connect a device. You can disconnect whenever you like.',
  },
];

export const purposeById = (id) => CONSENT_PURPOSES.find(p => p.id === id) || null;

/**
 * Where a client currently stands, by purpose.
 *
 * Reads the view rather than the table: the current position is the most recent
 * row per purpose, and the table deliberately keeps every earlier one.
 */
export async function loadConsent(clientId) {
  if (!clientId) return {};
  const { data } = await supabase.from('current_consent')
    .select('purpose, granted, version, recorded_at, method').eq('client_id', clientId);
  return Object.fromEntries((data || []).map(r => [r.purpose, r]));
}

/**
 * Has this client answered the questions we are currently asking?
 *
 * Only the required purpose gates the app. Saying no to photographs is an
 * answer, not an omission - being asked again every time you open the app
 * because you declined something optional would make the "no" worthless.
 */
export function consentOutstanding(state) {
  const core = state?.health_core;
  return !core || core.version !== CONSENT_VERSION;
}

export function hasConsent(state, purposeId) {
  const r = state?.[purposeId];
  return !!(r && r.granted);
}

/**
 * Record decisions. Never an update - each answer is a new row, so the history
 * of what someone agreed to, and when they changed their mind, survives.
 */
export async function recordConsent(clientId, decisions, { recordedBy, method = 'app' } = {}) {
  if (!clientId) return { error: { message: 'Not signed in.' } };
  const rows = Object.entries(decisions).map(([purpose, granted]) => {
    const p = purposeById(purpose);
    return p && {
      client_id: clientId, purpose, granted: !!granted,
      version: CONSENT_VERSION, wording: p.wording,
      method, recorded_by: recordedBy || clientId,
    };
  }).filter(Boolean);
  if (!rows.length) return {};
  const { error } = await supabase.from('consent_records').insert(rows);
  return error ? { error } : {};
}

/** Withdrawing is granting's equal and opposite, and just as easy. */
export function withdrawConsent(clientId, purposeId, opts) {
  return recordConsent(clientId, { [purposeId]: false }, opts);
}

/** Everything a client has ever agreed to or withdrawn, newest first. */
export async function consentHistory(clientId) {
  if (!clientId) return [];
  const { data } = await supabase.from('consent_records')
    .select('purpose, granted, version, method, recorded_at')
    .eq('client_id', clientId).order('recorded_at', { ascending: false });
  return data || [];
}
