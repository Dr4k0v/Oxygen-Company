import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
let schemaPromise;

function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS oxygen_users (
        uid BIGSERIAL UNIQUE,
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        device_id TEXT,
        browser_fingerprint TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by TEXT,
        provisioned BOOLEAN NOT NULL DEFAULT false,
        demo BOOLEAN NOT NULL DEFAULT false,
        avatar_url TEXT
      )`;
      await sql`CREATE SEQUENCE IF NOT EXISTS oxygen_users_uid_seq`;
      await sql`ALTER TABLE oxygen_users ADD COLUMN IF NOT EXISTS uid BIGINT`;
      await sql`WITH ranked AS (
        SELECT username, ROW_NUMBER() OVER (ORDER BY created_at ASC, username ASC) + COALESCE((SELECT MAX(uid) FROM oxygen_users), 0) AS next_uid
        FROM oxygen_users WHERE uid IS NULL
      ) UPDATE oxygen_users SET uid = ranked.next_uid FROM ranked WHERE oxygen_users.username = ranked.username`;
      await sql`SELECT setval('oxygen_users_uid_seq', COALESCE((SELECT MAX(uid) FROM oxygen_users), 0) + 1, false)`;
      await sql`ALTER TABLE oxygen_users ALTER COLUMN uid SET DEFAULT nextval('oxygen_users_uid_seq')`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS oxygen_users_uid_unique ON oxygen_users(uid)`;
      await sql`ALTER TABLE oxygen_users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_events (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        type TEXT NOT NULL,
        username TEXT,
        device_id TEXT,
        browser TEXT,
        ip TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_claims (
        claim_key TEXT PRIMARY KEY,
        username TEXT,
        device_id TEXT,
        reward_id TEXT NOT NULL,
        reward_label TEXT NOT NULL,
        promo_code TEXT,
        at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_promo_codes (
        code TEXT PRIMARY KEY,
        discount INTEGER NOT NULL DEFAULT 10,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ,
        created_by TEXT
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_rewards (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        short_label TEXT NOT NULL,
        weight NUMERIC NOT NULL DEFAULT 0.5,
        color TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oxygen_tickets (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        attachment_url TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        admin_reply TEXT,
        responded_by TEXT,
        replied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE oxygen_tickets ADD COLUMN IF NOT EXISTS attachment_url TEXT`;
      await sql`ALTER TABLE oxygen_tickets ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`;
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

function cleanUsername(value) {
  return String(value || '').trim();
}

function validUsername(value) {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(value);
}

function json(value) {
  return value && typeof value === 'object' ? value : {};
}

async function authenticate(body) {
  const username = cleanUsername(body.username).toLowerCase();
  if (!validUsername(username) || typeof body.passwordHash !== 'string') return null;
  const rows = await sql`SELECT username, role FROM oxygen_users WHERE username = ${username} AND password_hash = ${body.passwordHash}`;
  return rows[0] || null;
}

async function readState() {
  const [users, events, claims, settings, promoCodes, rewards] = await Promise.all([
    sql`SELECT uid, username, role, device_id AS "deviceId", browser_fingerprint AS "browserFingerprint", created_at AS "createdAt", created_by AS "createdBy", provisioned, demo, avatar_url AS avatar FROM oxygen_users ORDER BY created_at DESC LIMIT 1000`,
    sql`SELECT id, at, type, username, device_id AS "deviceId", browser, ip, payload FROM oxygen_events ORDER BY at DESC LIMIT 500`,
    sql`SELECT claim_key AS "claimKey", username, device_id AS "deviceId", reward_id AS "rewardId", reward_label AS "rewardLabel", promo_code AS "promoCode", at, expires_at AS "expiresAt" FROM oxygen_claims`,
    sql`SELECT key, value FROM oxygen_settings`,
    sql`SELECT code, discount, status, created_at AS "createdAt", expires_at AS "expiresAt", created_by AS "createdBy" FROM oxygen_promo_codes ORDER BY created_at DESC LIMIT 500`,
    sql`SELECT id, label, short_label AS "shortLabel", weight, color FROM oxygen_rewards ORDER BY created_at ASC`,
  ]);
  const settingsMap = Object.fromEntries(settings.map((item) => [item.key, item.value]));
  const eventList = events.map((event) => ({ ...json(event.payload), id: event.id, at: event.at, type: event.type, username: event.username, deviceId: event.deviceId, browser: event.browser, ip: event.ip }));
  const claimMap = Object.fromEntries(claims.map((claim) => [claim.claimKey, { rewardId: claim.rewardId, rewardLabel: claim.rewardLabel, promoCode: claim.promoCode, at: claim.at, expiresAt: claim.expiresAt }]));
  return { users, events: eventList, claims: claimMap, settings: settingsMap, generatedCodes: promoCodes, customRewards: rewards };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DATABASE_URL) return res.status(503).json({ ok: false, code: 'DATABASE_NOT_CONFIGURED', error: 'DATABASE_URL is not configured.' });
  try {
    await ensureSchema();
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...(await readState()) });
    if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Use GET or POST.' });
    const body = json(req.body);
    const action = String(body.action || '');

    if (action === 'register' || action === 'login') {
      const username = cleanUsername(body.username);
      const key = username.toLowerCase();
      if (!validUsername(username) || typeof body.passwordHash !== 'string' || body.passwordHash.length < 8) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Invalid credentials.' });
      if (action === 'register') {
        const existing = await sql`SELECT username FROM oxygen_users WHERE username = ${key}`;
        if (existing.length) return res.status(409).json({ ok: false, code: 'USER_EXISTS', error: 'This login is already registered.' });
        const role = key === 'drak0v' ? 'owner' : (body.provisioned && (body.role === 'owner' || body.role === 'admin') ? body.role : 'user');
        const rows = await sql`INSERT INTO oxygen_users (username, password_hash, role, device_id, browser_fingerprint, created_by, provisioned)
          VALUES (${key}, ${body.passwordHash}, ${role}, ${body.deviceId || null}, ${body.browserFingerprint || null}, ${body.createdBy || null}, ${Boolean(body.provisioned)})
          RETURNING uid, username, role, device_id AS "deviceId", browser_fingerprint AS "browserFingerprint", created_at AS "createdAt", created_by AS "createdBy", provisioned, demo, avatar_url AS avatar`;
        return res.status(201).json({ ok: true, user: rows[0] });
      }
      const rows = await sql`SELECT uid, username, role, device_id AS "deviceId", browser_fingerprint AS "browserFingerprint", created_at AS "createdAt", created_by AS "createdBy", provisioned, demo, avatar_url AS avatar FROM oxygen_users WHERE username = ${key} AND password_hash = ${body.passwordHash}`;
      if (!rows.length) return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS', error: 'Incorrect login or password.' });
      return res.status(200).json({ ok: true, user: rows[0] });
    }

    if (action === 'event') {
      const event = json(body.event);
      const id = String(event.id || crypto.randomUUID());
      const { id: ignoredId, at: ignoredAt, type, username, deviceId, browser, ip, ...payload } = event;
      if (!type) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Event type is required.' });
      await sql`INSERT INTO oxygen_events (id, at, type, username, device_id, browser, ip, payload) VALUES (${id}, ${event.at ? new Date(event.at) : new Date()}, ${type}, ${username || null}, ${deviceId || null}, ${browser || null}, ${ip || null}, ${JSON.stringify(payload)}::jsonb) ON CONFLICT (id) DO NOTHING`;
      return res.status(201).json({ ok: true, id });
    }

    if (action === 'claim') {
      const claim = json(body.claim);
      const keys = [body.deviceId, body.username && String(body.username).toLowerCase()].filter(Boolean);
      for (const key of keys) {
        await sql`INSERT INTO oxygen_claims (claim_key, username, device_id, reward_id, reward_label, promo_code, at, expires_at)
          VALUES (${key}, ${body.username || null}, ${body.deviceId || null}, ${claim.rewardId}, ${claim.rewardLabel}, ${claim.promoCode || null}, ${new Date(claim.at)}, ${claim.expiresAt ? new Date(claim.expiresAt) : null})
          ON CONFLICT (claim_key) DO UPDATE SET username = EXCLUDED.username, device_id = EXCLUDED.device_id, reward_id = EXCLUDED.reward_id, reward_label = EXCLUDED.reward_label, promo_code = EXCLUDED.promo_code, at = EXCLUDED.at, expires_at = EXCLUDED.expires_at`;
      }
      return res.status(201).json({ ok: true });
    }

    if (action === 'settings') {
      await sql`INSERT INTO oxygen_settings (key, value) VALUES ('admin', ${JSON.stringify(json(body.value))}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      return res.status(200).json({ ok: true });
    }

    if (action === 'reward') {
      const reward = json(body.reward);
      await sql`INSERT INTO oxygen_rewards (id, label, short_label, weight, color) VALUES (${reward.id}, ${reward.label}, ${reward.shortLabel}, ${Number(reward.weight) || 0.5}, ${reward.color}) ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, short_label = EXCLUDED.short_label, weight = EXCLUDED.weight, color = EXCLUDED.color`;
      return res.status(201).json({ ok: true });
    }

    if (action === 'promo') {
      const code = json(body.code);
      await sql`INSERT INTO oxygen_promo_codes (code, discount, status, created_at, expires_at, created_by) VALUES (${code.code}, ${Number(code.discount) || 10}, ${code.status || 'active'}, ${code.createdAt ? new Date(code.createdAt) : new Date()}, ${code.expiresAt ? new Date(code.expiresAt) : null}, ${code.createdBy || null}) ON CONFLICT (code) DO UPDATE SET status = EXCLUDED.status`;
      return res.status(201).json({ ok: true });
    }

    if (action === 'role') {
      const username = cleanUsername(body.username).toLowerCase();
      if (!validUsername(username) || username === 'drak0v') return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Invalid account.' });
      await sql`UPDATE oxygen_users SET role = ${body.role === 'owner' || body.role === 'admin' ? body.role : 'user'} WHERE username = ${username}`;
      return res.status(200).json({ ok: true });
    }

    if (action === 'profile') {
      const username = cleanUsername(body.username).toLowerCase();
      const avatar = typeof body.avatar === 'string' && body.avatar.length <= 700000 ? body.avatar : null;
      if (!validUsername(username) || !avatar || typeof body.passwordHash !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/i.test(avatar)) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Invalid avatar.' });
      const rows = await sql`UPDATE oxygen_users SET avatar_url = ${avatar} WHERE username = ${username} AND password_hash = ${body.passwordHash} RETURNING uid, username, role, device_id AS "deviceId", browser_fingerprint AS "browserFingerprint", created_at AS "createdAt", created_by AS "createdBy", provisioned, demo, avatar_url AS avatar`;
      if (!rows.length) return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', error: 'Account not found.' });
      return res.status(200).json({ ok: true, user: rows[0] });
    }

    if (action === 'password') {
      const username = cleanUsername(body.username).toLowerCase();
      if (!validUsername(username) || typeof body.currentPasswordHash !== 'string' || typeof body.newPasswordHash !== 'string' || body.newPasswordHash.length < 8) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Invalid password request.' });
      const rows = await sql`UPDATE oxygen_users SET password_hash = ${body.newPasswordHash} WHERE username = ${username} AND password_hash = ${body.currentPasswordHash} RETURNING username`;
      if (!rows.length) return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS', error: 'Current password is incorrect.' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'tickets') {
      const actor = await authenticate(body);
      if (!actor) return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS', error: 'Sign in again.' });
      const rows = actor.role === 'admin' || actor.role === 'owner'
        ? await sql`SELECT id, username, subject, message, attachment_url AS "attachmentUrl", status, admin_reply AS "adminReply", responded_by AS "respondedBy", replied_at AS "repliedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM oxygen_tickets ORDER BY updated_at DESC LIMIT 500`
        : await sql`SELECT id, username, subject, message, attachment_url AS "attachmentUrl", status, admin_reply AS "adminReply", responded_by AS "respondedBy", replied_at AS "repliedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM oxygen_tickets WHERE username = ${actor.username} ORDER BY updated_at DESC LIMIT 100`;
      return res.status(200).json({ ok: true, tickets: rows });
    }

    if (action === 'ticket_create') {
      const actor = await authenticate(body);
      const subject = String(body.subject || '').trim();
      const message = String(body.message || '').trim();
      const attachment = typeof body.attachmentUrl === 'string' && body.attachmentUrl.length <= 700000 && /^data:image\/(png|jpe?g|webp);base64,/i.test(body.attachmentUrl) ? body.attachmentUrl : null;
      if (!actor) return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS', error: 'Sign in again.' });
      if (subject.length < 3 || subject.length > 100 || message.length < 5 || message.length > 3000) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Use a 3-100 character subject and 5-3000 character message.' });
      const rows = await sql`INSERT INTO oxygen_tickets (username, subject, message, attachment_url) VALUES (${actor.username}, ${subject}, ${message}, ${attachment}) RETURNING id, username, subject, message, attachment_url AS "attachmentUrl", status, admin_reply AS "adminReply", responded_by AS "respondedBy", replied_at AS "repliedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
      return res.status(201).json({ ok: true, ticket: rows[0] });
    }

    if (action === 'ticket_update') {
      const actor = await authenticate(body);
      if (!actor || (actor.role !== 'admin' && actor.role !== 'owner')) return res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Admin access required.' });
      const id = Number(body.id);
      const status = ['open', 'in_progress', 'closed'].includes(body.status) ? body.status : 'open';
      const adminReply = String(body.adminReply || '').trim().slice(0, 3000) || null;
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: 'Invalid ticket.' });
      const rows = await sql`UPDATE oxygen_tickets SET status = ${status}, admin_reply = ${adminReply}, responded_by = ${actor.username}, replied_at = CASE WHEN ${adminReply} IS NULL THEN replied_at ELSE now() END, updated_at = now() WHERE id = ${id} RETURNING id, username, subject, message, attachment_url AS "attachmentUrl", status, admin_reply AS "adminReply", responded_by AS "respondedBy", replied_at AS "repliedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
      if (!rows.length) return res.status(404).json({ ok: false, code: 'TICKET_NOT_FOUND', error: 'Ticket not found.' });
      return res.status(200).json({ ok: true, ticket: rows[0] });
    }

    return res.status(400).json({ ok: false, code: 'UNKNOWN_ACTION', error: 'Unknown action.' });
  } catch (error) {
    console.error('Neon store error', error);
    return res.status(500).json({ ok: false, code: 'DATABASE_ERROR', error: 'Database request failed.' });
  }
}
