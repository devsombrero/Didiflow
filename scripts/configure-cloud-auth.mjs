// Applies DidiFlow's auth settings to the cloud Supabase project through the
// Management API: 6-digit OTP e-mails (the desktop app has no redirect
// target), pt-BR templates from supabase/templates, the password policy used
// locally and Gmail SMTP for auth e-mails.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-cloud-auth.mjs
//
// Reads DIDIFLOW_SUPABASE_URL and DIDIFLOW_GMAIL_* from .env.production.
// The access token is used only for this request and never stored.
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env.production')) process.loadEnvFile('.env.production');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.DIDIFLOW_SUPABASE_URL ?? '';
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];
const gmail = process.env.DIDIFLOW_GMAIL_ADDRESS;
const gmailPass = process.env.DIDIFLOW_GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

if (!token || !ref) {
  console.error('configure-cloud-auth: set SUPABASE_ACCESS_TOKEN and DIDIFLOW_SUPABASE_URL.');
  process.exit(1);
}

const body = {
  site_url: 'app://didiflow',
  mailer_otp_length: 6,
  mailer_subjects_confirmation: 'DidiFlow: confirme seu e-mail',
  mailer_templates_confirmation_content: readFileSync(
    'supabase/templates/confirmation.html',
    'utf8',
  ),
  mailer_subjects_recovery: 'DidiFlow: redefinição de senha',
  mailer_templates_recovery_content: readFileSync('supabase/templates/recovery.html', 'utf8'),
  password_min_length: 8,
  password_required_characters: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  ...(gmail && gmailPass
    ? {
        smtp_host: 'smtp.gmail.com',
        smtp_port: '465',
        smtp_user: gmail,
        smtp_pass: gmailPass,
        smtp_admin_email: gmail,
        smtp_sender_name: 'DidiFlow',
        rate_limit_email_sent: 30,
      }
    : {}),
};

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const result = await response.json();
if (!response.ok) {
  console.error(`configure-cloud-auth: HTTP ${response.status}`, JSON.stringify(result));
  process.exit(1);
}
console.log(`configure-cloud-auth: project ${ref} updated`);
for (const key of [
  'site_url',
  'mailer_otp_length',
  'password_min_length',
  'smtp_host',
  'smtp_sender_name',
  'rate_limit_email_sent',
]) {
  console.log(`  ${key} = ${JSON.stringify(result[key])}`);
}
