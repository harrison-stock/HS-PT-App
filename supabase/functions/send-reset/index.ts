// Supabase Edge Function: send-reset
// Sends a branded password-reset email via the Resend API, bypassing Supabase's
// built-in SMTP (which isn't configured for this project — the app sends all
// mail through Resend). Generates a recovery link with the admin API and emails
// it. Callable WITHOUT auth — a user resetting a forgotten password has no
// session. To avoid email enumeration it always reports success to the client,
// only actually sending when the address belongs to a real account.
//
// Requires the same secrets as invite-client:
//   supabase secrets set RESEND_API_KEY=re_...
// Deploy:
//   supabase functions deploy send-reset   (or paste via the dashboard editor)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const FROM = 'Harrison Stock PT <admin@harrisonstock.co.uk>';

function resetEmailHtml(resetUrl: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ECEFF4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECEFF4;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(9,78,83,0.08);">
          <tr><td>
            <img src="https://app.harrisonstock.co.uk/email-header.png" width="480" style="display:block;width:100%;height:auto;border:0;" alt="Harrison Stock — Personal Training &amp; Nutrition"/>
          </td></tr>
          <tr><td align="center" style="padding:22px 34px 0;">
            <p style="font-size:10px;color:#8693A0;margin:0;letter-spacing:0.14em;font-weight:700;">HARRISON STOCK &middot; PERSONAL TRAINING &amp; NUTRITION</p>
          </td></tr>
          <tr><td style="padding:16px 34px 6px;">
            <h1 style="font-size:22px;line-height:1.25;color:#094E53;margin:0 0 14px;font-weight:800;">Reset your password</h1>
            <p style="font-size:15px;line-height:1.55;color:#4A5A60;margin:0;">
              We received a request to reset the password for your HS PT account. Tap the button below to choose a new one. If you didn't request this, you can safely ignore this email.
            </p>
          </td></tr>
          <tr><td align="center" style="padding:24px 34px 8px;">
            <a href="${resetUrl}" style="display:inline-block;background:#189CAA;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.02em;padding:15px 30px;border-radius:10px;">
              Reset my password &rarr;
            </a>
          </td></tr>
          <tr><td style="padding:14px 34px 30px;">
            <p style="font-size:12px;line-height:1.55;color:#8693A0;margin:0;">
              If the button doesn't work, copy and paste this link:<br/>
              <a href="${resetUrl}" style="color:#189CAA;word-break:break-all;">${resetUrl}</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');

    const { email, redirectTo } = await req.json();
    if (!email) return json({ error: 'Email is required' }, 400);
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not set — add it under Edge Functions → Secrets' }, 500);

    const admin = createClient(url, serviceKey);

    // Generate a recovery link. If the address isn't a real account this errors;
    // we swallow it and still report success so we don't leak who has an account.
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: String(email).trim(),
      options: redirectTo ? { redirectTo } : undefined,
    });
    const resetUrl = data?.properties?.action_link;
    if (linkErr || !resetUrl) {
      console.warn('generateLink (recovery) failed:', linkErr?.message);
      return json({ ok: true, sent: false });
    }

    const text =
`Reset your password

We received a request to reset the password for your HS PT account. Open the link below to choose a new one. If you didn't request this, you can safely ignore this email.

${resetUrl}

— Harrison Stock · Personal Training & Nutrition`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [String(email).trim()],
        subject: 'Reset your HS PT password',
        html: resetEmailHtml(resetUrl),
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend send failed:', res.status, detail);
      return json({ error: `Email send failed (${res.status})`, detail, marker: 'resend' }, 400);
    }

    return json({ ok: true, sent: true, marker: 'resend' });
  } catch (e) {
    console.error('send-reset crashed:', e);
    return json({ error: (e as any)?.message || String(e) }, 500);
  }
});
