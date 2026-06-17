// Supabase Edge Function: invite-client
// Sends a Supabase Auth invite email to a prospective client, carrying the
// trainer link + managed-client id in user metadata so signup auto-connects.
//
// Deploy:  supabase functions deploy invite-client
// Requires SMTP configured in Supabase (Auth → Emails) for delivery.
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
    if (prof?.role !== 'trainer') return json({ error: 'Only trainers can invite clients' }, 403);

    const { email, name, managedClientId, redirectTo } = await req.json();
    if (!email) return json({ error: 'Email is required' }, 400);

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        name: name ?? '',
        role: 'client',
        trainer_id: user.id,
        managed_client_id: managedClientId ?? null,
      },
      redirectTo: redirectTo || url,
    });
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
