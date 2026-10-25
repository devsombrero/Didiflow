// End-to-end checks against the local Supabase stack (npm run db:start).
// Exercises the real Auth service (OTP e-mails read from Mailpit) and RLS
// through the REST API with the public anon/publishable key.
// Run with: npm run test:integration
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env')) process.loadEnvFile('.env');

const SUPABASE_URL = process.env.DIDIFLOW_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.DIDIFLOW_SUPABASE_ANON_KEY;
const MAILPIT_URL = process.env.DIDIFLOW_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const PASSWORD = 'Secret123';

if (!['127.0.0.1', 'localhost'].includes(new URL(SUPABASE_URL).hostname)) {
  throw new Error('Integration tests create users and must only run against a local Supabase.');
}
assert.ok(ANON_KEY, 'DIDIFLOW_SUPABASE_ANON_KEY is required (see .env.example)');

const newClient = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const uniqueEmail = (name) =>
  `${name}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`;

/** Waits for the newest e-mail to `to` received after `since` and returns its 6-digit code. */
async function readOtp(to, since) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages = [] } = await search.json();
    const latest = messages.find((message) => new Date(message.Created) >= since);
    if (latest) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)).json();
      const code = /\b(\d{6})\b/.exec(message.Text ?? message.HTML)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No OTP e-mail received for ${to}`);
}

async function signUpAndConfirm(name) {
  const client = newClient();
  const email = uniqueEmail(name);
  const since = new Date(Date.now() - 1000);

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { display_name: name } },
  });
  assert.ifError(error);
  assert.equal(data.session, null, 'sign-up must require e-mail confirmation');

  const verified = await client.auth.verifyOtp({
    email,
    token: await readOtp(email, since),
    type: 'email',
  });
  assert.ifError(verified.error);
  assert.ok(verified.data.session, 'confirming the code signs the user in');
  return { client, email, userId: verified.data.user.id };
}

describe('auth and RLS against local Supabase', () => {
  let alice;
  let bob;

  before(async () => {
    alice = await signUpAndConfirm('Alice');
    bob = await signUpAndConfirm('Bob');
  });

  it('rejects sign-in before the e-mail is confirmed', async () => {
    const client = newClient();
    const email = uniqueEmail('pending');
    assert.ifError((await client.auth.signUp({ email, password: PASSWORD })).error);

    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(error?.code, 'email_not_confirmed');
  });

  it('rejects weak passwords', async () => {
    const { error } = await newClient().auth.signUp({
      email: uniqueEmail('weak'),
      password: 'weakpass',
    });
    assert.equal(error?.code, 'weak_password');
  });

  it('creates profile and default preferences on sign-up', async () => {
    const profile = await alice.client.from('profiles').select('*').single();
    assert.ifError(profile.error);
    assert.equal(profile.data.display_name, 'Alice');

    const preferences = await alice.client.from('user_preferences').select('*').single();
    assert.ifError(preferences.error);
    assert.equal(preferences.data.theme, 'system');
  });

  it('lets users update their own preferences and validates them', async () => {
    const updated = await alice.client
      .from('user_preferences')
      .update({ theme: 'dark', timezone: 'Europe/Lisbon' })
      .eq('user_id', alice.userId)
      .select()
      .single();
    assert.ifError(updated.error);
    assert.equal(updated.data.theme, 'dark');

    const invalid = await alice.client
      .from('user_preferences')
      .update({ timezone: 'Mars/Olympus' })
      .eq('user_id', alice.userId);
    assert.equal(invalid.error?.code, '22023');
  });

  it('isolates tasks between users', async () => {
    const bobTask = await bob.client
      .from('tasks')
      .insert({ title: 'Bob private task' })
      .select()
      .single();
    assert.ifError(bobTask.error);

    const visible = await alice.client.from('tasks').select('id');
    assert.ifError(visible.error);
    assert.equal(visible.data.length, 0, 'Alice must not see Bob tasks');

    const updated = await alice.client
      .from('tasks')
      .update({ title: 'hacked' })
      .eq('id', bobTask.data.id)
      .select();
    assert.ifError(updated.error);
    assert.equal(updated.data.length, 0, 'Alice must not update Bob tasks');

    const removed = await alice.client.from('tasks').delete().eq('id', bobTask.data.id).select();
    assert.equal(removed.data.length, 0, 'Alice must not delete Bob tasks');

    const stillThere = await bob.client
      .from('tasks')
      .select('title')
      .eq('id', bobTask.data.id)
      .single();
    assert.equal(stillThere.data.title, 'Bob private task');

    const spoofed = await alice.client
      .from('tasks')
      .insert({ title: 'spoof', owner_id: bob.userId });
    assert.equal(spoofed.error?.code, '42501', 'Alice cannot create tasks for Bob');
  });

  it('denies anonymous access to application data', async () => {
    const { error } = await newClient().from('tasks').select('id');
    assert.equal(error?.code, '42501');
  });

  it('resets the password with a recovery code', async () => {
    const client = newClient();
    const since = new Date(Date.now() - 1000);
    assert.ifError((await client.auth.resetPasswordForEmail(alice.email)).error);

    const verified = await client.auth.verifyOtp({
      email: alice.email,
      token: await readOtp(alice.email, since),
      type: 'recovery',
    });
    assert.ifError(verified.error);
    assert.ifError((await client.auth.updateUser({ password: 'NewSecret456' })).error);

    const oldPassword = await newClient().auth.signInWithPassword({
      email: alice.email,
      password: PASSWORD,
    });
    assert.equal(oldPassword.error?.code, 'invalid_credentials');
    const newPassword = await newClient().auth.signInWithPassword({
      email: alice.email,
      password: 'NewSecret456',
    });
    assert.ifError(newPassword.error);
  });
});
