import { supabase } from './supabase'

// Asking to be erased, and answering.
//
// The request is a record in its own right. The date someone asked is what a
// response time is measured against, and "we never received it" should not be
// something either side has to rely on. So the row survives the decision, and a
// client cannot withdraw the fact of having asked - only the coach moves it out
// of pending.

/** The client's open request, if they have one. */
export async function myErasureRequest(clientId) {
  if (!clientId) return null;
  const { data } = await supabase.from('erasure_requests')
    .select('id, status, requested_at, decided_at, note')
    .eq('client_id', clientId).order('requested_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

export async function requestErasure(clientId, trainerId, note) {
  if (!clientId) return { error: { message: 'Not signed in.' } };
  const { error } = await supabase.from('erasure_requests')
    .insert({ client_id: clientId, trainer_id: trainerId || null, note: (note || '').trim() || null });
  // The partial unique index refuses a second open request, which is the right
  // answer - one is already waiting.
  if (error && /duplicate|unique/i.test(error.message || '')) return {};
  return error ? { error } : {};
}

/** Requests waiting on this coach. */
export async function pendingErasureRequests(trainerId) {
  if (!trainerId) return [];
  const { data } = await supabase.from('erasure_requests')
    .select('id, client_id, requested_at, note')
    .eq('trainer_id', trainerId).eq('status', 'pending')
    .order('requested_at', { ascending: true });
  return data || [];
}

export async function declineErasure(requestId, note) {
  const { error } = await supabase.from('erasure_requests')
    .update({ status: 'declined', decided_at: new Date().toISOString(), note: (note || '').trim() || null })
    .eq('id', requestId);
  return error ? { error } : {};
}

/**
 * Erase a client, for good.
 *
 * The database removes every row keyed to them and hands back the storage paths
 * it cannot reach - deleting the row that names a photo is not deleting the
 * photo, and an erasure that leaves the files behind is not one. Those are
 * removed here, and a registered client's login is reported as still standing,
 * because only the service role can take an auth user away.
 */
export async function eraseClient(clientId, requestId) {
  const { data, error } = await supabase.rpc('erase_client', { p_client_id: clientId });
  if (error) return { error };

  const paths = [
    ...((data?.storage?.photos) || []),
    ...((data?.storage?.documents) || []),
  ].filter(Boolean);

  const failed = [];
  if (paths.length) {
    for (const bucket of ['progress-photos', 'client-vault']) {
      const { error: sErr } = await supabase.storage.from(bucket).remove(paths);
      // A path that isn't in this bucket is not a failure; a bucket that
      // refused the whole call is.
      if (sErr && !/not found/i.test(sErr.message || '')) failed.push(`${bucket}: ${sErr.message}`);
    }
  }
  if (requestId) {
    await supabase.from('erasure_requests')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', requestId);
  }
  return { result: data, storageFailed: failed };
}
