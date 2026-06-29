// Supabase Edge Function: delete-client
// Permanently removes a client from a trainer's roster.
//  - Managed (never-signed-up) clients: deletes the managed_clients row.
//  - Real accounts: deletes the underlying Auth user (cascades the profile and
//    all owned rows), so nothing is left behind.
// Requires the service-role key — the browser (anon key + RLS) cannot delete
// auth users, which is why detaching client-side left the profile in place.
//
// Deploy:  supabase functions deploy delete-client   (or paste via dashboard)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT — they must be a signed-in trainer.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (prof?.role !== 'trainer') return json({ error: 'Only trainers can remove clients' }, 403);

    const { clientId, managed } = await req.json();
    if (!clientId) return json({ error: 'clientId is required' }, 400);

    if (managed) {
      // Managed client — just a roster row owned by this trainer.
      const { error } = await admin.from('managed_clients')
        .delete().eq('id', clientId).eq('trainer_id', user.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // Real account — verify it belongs to this trainer before deleting.
    const { data: target } = await admin.from('profiles')
      .select('id, trainer_id, role').eq('id', clientId).single();
    if (!target) return json({ error: 'Client not found' }, 404);
    if (target.trainer_id !== user.id) return json({ error: 'Not your client' }, 403);
    if (target.role === 'trainer') return json({ error: 'Cannot delete a trainer account' }, 403);

    // Detach any managed-client links so nothing dangles, then delete the auth
    // user — this cascades the profile and all rows owned by the account.
    await admin.from('managed_clients').update({ linked_profile_id: null }).eq('linked_profile_id', clientId);
    const { error: delErr } = await admin.auth.admin.deleteUser(clientId);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    console.error('delete-client crashed:', e);
    return json({ error: (e as any)?.message || String(e) }, 500);
  }
});
