// Supabase Edge Function: invite-client
// Sends a branded client-invite email DIRECTLY via the Resend API — bypassing
// Supabase's built-in SMTP entirely. The email carries the app's own invite
// link (?invite=code&tid=…&mc=…), so no Supabase auth user is created up front
// (that previously caused duplicate / "already registered" problems). The auth
// account is created only when the client follows the link and sets a password.
//
// Requires a Resend API key set as the `RESEND_API_KEY` Edge Function secret:
//   supabase secrets set RESEND_API_KEY=re_...
// (or Dashboard → Edge Functions → Secrets). Deploy:
//   supabase functions deploy invite-client   (or paste via the dashboard editor)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Send from Harrison's real business address (same verified domain, so SPF/DKIM/
// DMARC still align) to lean on its existing sending reputation.
const FROM = 'Harrison Stock <harrison@harrisonstock.co.uk>';

function inviteEmailHtml(firstName: string, trainerName: string, inviteUrl: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ECEFF4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECEFF4;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(9,78,83,0.08);">
          <tr><td>
            <img src="https://app.harrisonstock.co.uk/email-header.png" width="480" style="display:block;width:100%;height:auto;border:0;" alt="Harrison Stock — Personal Training &amp; Nutrition"/>
          </td></tr>
          <tr><td style="padding:30px 34px 6px;">
            <p style="font-size:16px;color:#094E53;margin:0 0 16px;font-weight:600;">Hi ${firstName},</p>
            <p style="font-size:15px;line-height:1.55;color:#4A5A60;margin:0;">
              ${trainerName} has invited you to join their training app — your programmes, workouts, progress tracking and check-ins, all in one place.
            </p>
          </td></tr>
          <tr><td align="center" style="padding:24px 34px 8px;">
            <a href="${inviteUrl}" style="display:inline-block;background:#189CAA;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.02em;padding:15px 30px;border-radius:10px;">
              Set up your account &rarr;
            </a>
          </td></tr>
          <tr><td style="padding:14px 34px 30px;">
            <p style="font-size:12px;line-height:1.55;color:#8693A0;margin:0;">
              Or paste this link into your browser:<br/>
              <a href="${inviteUrl}" style="color:#189CAA;word-break:break-all;">${inviteUrl}</a>
            </p>
          </td></tr>
        </table>
        <p style="font-size:11px;color:#8693A0;margin:18px 0 0;letter-spacing:0.04em;">HARRISON STOCK &middot; PERSONAL TRAINING &amp; NUTRITION</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT — they must be a signed-in trainer.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin.from('profiles').select('role, name').eq('id', user.id).single();
    if (prof?.role !== 'trainer') return json({ error: 'Only trainers can invite clients' }, 403);

    const { email, name, inviteUrl } = await req.json();
    if (!email) return json({ error: 'Email is required' }, 400);
    if (!inviteUrl) return json({ error: 'Invite link is missing' }, 400);
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not set — add it under Edge Functions → Secrets' }, 500);

    const trainerName = (prof?.name || '').trim() || 'Your coach';
    const hasName = !!(name || '').trim();
    const firstName = hasName ? (name as string).trim().split(/\s+/)[0] : 'there';
    const subject = hasName
      ? `${firstName}, you've been invited to the HS PT app`
      : `You've been invited to the HS PT app`;

    // Plain-text alternative — mail with both parts lands in the inbox far more
    // often than HTML-only mail.
    const text =
`Hi ${firstName},

${trainerName} has invited you to join their training app — your programmes, workouts, progress tracking and check-ins, all in one place.

Set up your account:
${inviteUrl}

— Harrison Stock · Personal Training & Nutrition`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: user.email || undefined,
        subject,
        html: inviteEmailHtml(firstName, trainerName, inviteUrl),
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend send failed:', res.status, detail);
      return json({ error: `Email send failed (${res.status})`, detail, marker: 'resend' }, 400);
    }

    const result = await res.json().catch(() => ({}));
    return json({ ok: true, id: result?.id ?? null, marker: 'resend' });
  } catch (e) {
    console.error('invite-client crashed:', e);
    return json({ error: (e as any)?.message || String(e) }, 500);
  }
});
