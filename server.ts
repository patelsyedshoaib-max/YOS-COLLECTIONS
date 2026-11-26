import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const PIN_REGEX = /^\d{4,8}$/;
const CUSTOMER_ID_REGEX = /^YOS-[A-Z0-9]{6}$/;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;
const STAMP_COOLDOWN_MS = 5 * 1000;
const MAX_PIN_ATTEMPTS = 8;
const PIN_LOCKOUT_MS = 60 * 1000;

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'yos_collection.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    reward_override TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS owner_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL UNIQUE,
    mobile_normalized TEXT NOT NULL UNIQUE,
    qr_code_value TEXT NOT NULL UNIQUE,
    home_store_id TEXT,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (home_store_id) REFERENCES stores(id)
  );

  CREATE TABLE IF NOT EXISTS stamp_cards (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    current_stamps INTEGER NOT NULL DEFAULT 0 CHECK (current_stamps >= 0 AND current_stamps <= 6),
    cycle_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'in_progress',
    completed_at TEXT,
    redeemed_at TEXT,
    total_stamps_earned INTEGER NOT NULL DEFAULT 0,
    total_cycles_completed INTEGER NOT NULL DEFAULT 0,
    owner_notified INTEGER NOT NULL DEFAULT 0,
    last_stamped_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(customer_id, store_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS completed_cycles (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    stamps_count INTEGER NOT NULL DEFAULT 6,
    reward_text TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    redeemed_at TEXT,
    started_new_cycle_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stamp_transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    stamp_number INTEGER,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cards_customer ON stamp_cards(customer_id);
  CREATE INDEX IF NOT EXISTS idx_cards_store ON stamp_cards(store_id);
  CREATE INDEX IF NOT EXISTS idx_tx_customer ON stamp_transactions(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_store_time ON stamp_transactions(store_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_cycles_customer ON completed_cycles(customer_id, completed_at DESC);
`);

function hashPin(pin: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash };
}

function verifyPinAgainstHash(pin: string, salt: string, expectedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(pin, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyStoredOwnerPin(pin: string): boolean {
  if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) return false;
  const row = db
    .prepare('SELECT pin_salt, pin_hash FROM owner_auth WHERE id = 1')
    .get() as { pin_salt: string; pin_hash: string } | undefined;
  if (!row) return false;
  return verifyPinAgainstHash(pin, row.pin_salt, row.pin_hash);
}

// Seed initial stores, settings, and hashed Owner PIN on first run
function seedDefaults(): void {
  const now = new Date().toISOString();

  const storeCount = (db.prepare('SELECT COUNT(*) as count FROM stores').get() as { count: number }).count;
  if (storeCount === 0) {
    const insertStore = db.prepare(
      'INSERT INTO stores (id, name, location, reward_override, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    );
    const seedStores = [
      ['yos-flagship', 'Flagship Atelier', 'Fifth Avenue · Salon 01', null],
      ['yos-downtown', 'Downtown Gallery', 'SoHo · Mercer Street', null],
      ['yos-promenade', 'Grand Promenade', 'Design District Pavilion', null],
    ] as const;
    const tx = db.transaction(() => {
      for (const [id, name, location, reward] of seedStores) {
        insertStore.run(id, name, location, reward, now);
      }
    });
    tx();
  }

  const rewardSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('reward_text');
  if (!rewardSetting) {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'reward_text',
      '20% Off Your Next Purchase',
      now
    );
  }

  const authRow = db.prepare('SELECT id FROM owner_auth WHERE id = 1').get();
  if (!authRow) {
    const envPin = (process.env.DEFAULT_OWNER_PIN || '').trim();
    const initialPin = PIN_REGEX.test(envPin) ? envPin : '0000';
    const { salt, hash } = hashPin(initialPin);
    db.prepare('INSERT INTO owner_auth (id, pin_salt, pin_hash, updated_at) VALUES (1, ?, ?, ?)').run(
      salt,
      hash,
      now
    );
  }
}

seedDefaults();

// In-memory security state
const ownerSessions = new Map<string, { createdAt: number; expiresAt: number }>();
const pinRateLimits = new Map<string, { failures: number; lockedUntil: number }>();
const idempotencyCache = new Map<string, { timestamp: number; payload: unknown }>();
const sseClients = new Set<Response>();

function broadcastEvent(event: {
  type: string;
  customerId?: string;
  storeId?: string;
  actionType?: string;
  timestamp: string;
}): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function checkPinRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const record = pinRateLimits.get(ip);
  if (!record) return { allowed: true };
  const now = Date.now();
  if (record.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  if (record.lockedUntil > 0 && record.lockedUntil <= now) {
    pinRateLimits.delete(ip);
  }
  return { allowed: true };
}

function recordPinFailure(ip: string): void {
  const existing = pinRateLimits.get(ip) || { failures: 0, lockedUntil: 0 };
  existing.failures += 1;
  if (existing.failures >= MAX_PIN_ATTEMPTS) {
    existing.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
    existing.failures = 0;
  }
  pinRateLimits.set(ip, existing);
}

function clearPinFailures(ip: string): void {
  pinRateLimits.delete(ip);
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function requireOwnerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Owner authentication required.' });
    return;
  }
  const session = ownerSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) ownerSessions.delete(token);
    res.status(401).json({ error: 'Owner session expired. Please sign in again.' });
    return;
  }
  next();
}

function normalizeMobile(input: string): string {
  return input.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function normalizeCustomerIdInput(raw: string): string {
  const trimmed = raw.trim();
  const qrMatch = trimmed.match(/yos:\/\/customer\/(YOS-[A-Z0-9]{6})/i);
  if (qrMatch) return qrMatch[1].toUpperCase();
  const directMatch = trimmed.match(/(YOS-[A-Z0-9]{6})/i);
  if (directMatch) return directMatch[1].toUpperCase();
  return trimmed.toUpperCase();
}

function generateUniqueCustomerId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const existsStmt = db.prepare('SELECT 1 FROM customers WHERE id = ?');
  for (let attempt = 0; attempt < 25; attempt++) {
    const bytes = crypto.randomBytes(6);
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += alphabet[bytes[i] % alphabet.length];
    }
    const candidate = `YOS-${suffix}`;
    if (!existsStmt.get(candidate)) return candidate;
  }
  return `YOS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function getGlobalRewardText(): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('reward_text') as
    | { value: string }
    | undefined;
  return row?.value || '20% Off Your Next Purchase';
}

function ensureCustomerStoreCards(customerId: string): void {
  const now = new Date().toISOString();
  const stores = db.prepare('SELECT id FROM stores WHERE is_active = 1').all() as Array<{ id: string }>;
  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO stamp_cards (
      id, customer_id, store_id, current_stamps, cycle_number, status,
      total_stamps_earned, total_cycles_completed, owner_notified, updated_at
    ) VALUES (?, ?, ?, 0, 1, 'in_progress', 0, 0, 0, ?)
  `);
  const tx = db.transaction(() => {
    for (const store of stores) {
      insertCard.run(`${customerId}__${store.id}`, customerId, store.id, now);
    }
  });
  tx();
}

interface StoreRow {
  id: string;
  name: string;
  location: string;
  reward_override: string | null;
  is_active: number;
  created_at: string;
}

interface CustomerRow {
  id: string;
  full_name: string;
  mobile_number: string;
  mobile_normalized: string;
  qr_code_value: string;
  home_store_id: string | null;
  is_blocked: number;
  created_at: string;
  updated_at: string;
}

function formatStore(row: StoreRow, globalReward: string) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    rewardOverride: row.reward_override,
    effectiveRewardText: row.reward_override?.trim() || globalReward,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

function buildCustomerBundle(customerId: string) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as CustomerRow | undefined;
  if (!customer) return null;

  ensureCustomerStoreCards(customer.id);
  const globalReward = getGlobalRewardText();

  const storeRows = db
    .prepare('SELECT * FROM stores WHERE is_active = 1 ORDER BY created_at ASC')
    .all() as StoreRow[];
  const storeMap = new Map(storeRows.map((s) => [s.id, formatStore(s, globalReward)]));

  const cardRows = db
    .prepare(
      `SELECT sc.*, s.name as store_name, s.location as store_location, s.reward_override, s.is_active as store_active
       FROM stamp_cards sc
       JOIN stores s ON s.id = sc.store_id
       WHERE sc.customer_id = ?
       ORDER BY s.created_at ASC`
    )
    .all(customer.id) as Array<{
      id: string;
      customer_id: string;
      store_id: string;
      current_stamps: number;
      cycle_number: number;
      status: string;
      completed_at: string | null;
      redeemed_at: string | null;
      total_stamps_earned: number;
      total_cycles_completed: number;
      owner_notified: number;
      last_stamped_at: string | null;
      updated_at: string;
      store_name: string;
      store_location: string;
      reward_override: string | null;
      store_active: number;
    }>;

  const cycleRows = db
    .prepare(
      `SELECT cc.*, s.name as store_name
       FROM completed_cycles cc
       JOIN stores s ON s.id = cc.store_id
       WHERE cc.customer_id = ?
       ORDER BY cc.completed_at DESC`
    )
    .all(customer.id) as Array<{
      id: string;
      customer_id: string;
      store_id: string;
      store_name: string;
      cycle_number: number;
      stamps_count: number;
      reward_text: string;
      completed_at: string;
      redeemed_at: string | null;
      started_new_cycle_at: string | null;
    }>;

  const txRows = db
    .prepare(
      `SELECT t.*, s.name as store_name
       FROM stamp_transactions t
       JOIN stores s ON s.id = t.store_id
       WHERE t.customer_id = ?
       ORDER BY t.created_at DESC
       LIMIT 100`
    )
    .all(customer.id) as Array<{
      id: string;
      customer_id: string;
      store_id: string;
      store_name: string;
      cycle_number: number;
      action_type: string;
      stamp_number: number | null;
      note: string | null;
      created_at: string;
    }>;

  return {
    customer: {
      id: customer.id,
      fullName: customer.full_name,
      mobileNumber: customer.mobile_number,
      qrCodeValue: customer.qr_code_value,
      homeStoreId: customer.home_store_id || storeRows[0]?.id || null,
      isBlocked: customer.is_blocked === 1,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    },
    rewardText: globalReward,
    stores: Array.from(storeMap.values()),
    cards: cardRows
      .filter((c) => c.store_active === 1 || c.total_stamps_earned > 0 || c.current_stamps > 0)
      .map((c) => ({
        id: c.id,
        customerId: c.customer_id,
        storeId: c.store_id,
        storeName: c.store_name,
        storeLocation: c.store_location,
        rewardText: c.reward_override?.trim() || globalReward,
        currentStamps: c.current_stamps,
        cycleNumber: c.cycle_number,
        status: c.status as 'in_progress' | 'completed' | 'redeemed',
        completedAt: c.completed_at,
        redeemedAt: c.redeemed_at,
        totalStampsEarned: c.total_stamps_earned,
        totalCyclesCompleted: c.total_cycles_completed,
        ownerNotified: c.owner_notified === 1,
        lastStampedAt: c.last_stamped_at,
        updatedAt: c.updated_at,
      })),
    completedCycles: cycleRows.map((c) => ({
      id: c.id,
      customerId: c.customer_id,
      storeId: c.store_id,
      storeName: c.store_name,
      cycleNumber: c.cycle_number,
      stampsCount: c.stamps_count,
      rewardText: c.reward_text,
      completedAt: c.completed_at,
      redeemedAt: c.redeemed_at,
      startedNewCycleAt: c.started_new_cycle_at,
    })),
    transactions: txRows.map((t) => ({
      id: t.id,
      customerId: t.customer_id,
      storeId: t.store_id,
      storeName: t.store_name,
      cycleNumber: t.cycle_number,
      actionType: t.action_type,
      stampNumber: t.stamp_number,
      note: t.note,
      createdAt: t.created_at,
    })),
  };
}

function buildAnalytics(storeId: string | null) {
  const now = new Date();
  const baseQuery = storeId
    ? `SELECT created_at FROM stamp_transactions WHERE action_type = 'stamp_added' AND store_id = ?`
    : `SELECT created_at FROM stamp_transactions WHERE action_type = 'stamp_added'`;
  const rows = (storeId ? db.prepare(baseQuery).all(storeId) : db.prepare(baseQuery).all()) as Array<{
    created_at: string;
  }>;

  // Daily: last 14 days
  const dailyMap = new Map<string, number>();
  const dailyKeys: Array<{ key: string; label: string }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyMap.set(key, 0);
    dailyKeys.push({ key, label });
  }

  // Weekly: last 8 weeks (Monday-based buckets)
  const weeklyBuckets: Array<{ start: Date; end: Date; label: string; count: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeklyBuckets.push({ start, end, label, count: 0 });
  }

  // Monthly: last 12 months
  const monthlyMap = new Map<string, number>();
  const monthlyKeys: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyMap.set(key, 0);
    monthlyKeys.push({ key, label });
  }

  for (const row of rows) {
    const dt = new Date(row.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    const dayKey = dt.toISOString().slice(0, 10);
    if (dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
    }
    const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);
    }
    for (const bucket of weeklyBuckets) {
      if (dt >= bucket.start && dt <= bucket.end) {
        bucket.count += 1;
        break;
      }
    }
  }

  return {
    daily: dailyKeys.map((d) => ({ label: d.label, stamps: dailyMap.get(d.key) || 0 })),
    weekly: weeklyBuckets.map((w) => ({ label: `Wk ${w.label}`, stamps: w.count })),
    monthly: monthlyKeys.map((m) => ({ label: m.label, stamps: monthlyMap.get(m.key) || 0 })),
  };
}

// Periodically prune expired sessions and idempotency keys
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of ownerSessions.entries()) {
    if (session.expiresAt < now) ownerSessions.delete(token);
  }
  for (const [key, item] of idempotencyCache.entries()) {
    if (now - item.timestamp > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(key);
  }
}, 60_000).unref();

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // Real-time Server-Sent Events stream for cross-device updates
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Public bootstrap: active stores & global reward text only
  app.get('/api/public/bootstrap', (_req, res) => {
    const globalReward = getGlobalRewardText();
    const stores = (
      db.prepare('SELECT * FROM stores WHERE is_active = 1 ORDER BY created_at ASC').all() as StoreRow[]
    ).map((s) => formatStore(s, globalReward));
    res.json({ stores, rewardText: globalReward });
  });

  // Customer registration
  app.post('/api/customers/register', (req, res) => {
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const mobileRaw = typeof req.body?.mobileNumber === 'string' ? req.body.mobileNumber.trim() : '';
    const homeStoreIdRaw = typeof req.body?.homeStoreId === 'string' ? req.body.homeStoreId.trim() : '';

    if (fullName.length < 2 || fullName.length > 80) {
      res.status(400).json({ error: 'Please enter a valid full name (2 to 80 characters).' });
      return;
    }

    const mobileNormalized = normalizeMobile(mobileRaw);
    const digitsOnly = mobileNormalized.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      res.status(400).json({ error: 'Please enter a valid mobile number (7 to 15 digits).' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM customers WHERE mobile_normalized = ?')
      .get(mobileNormalized) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({
        error: 'An account with this mobile number already exists. Use "Open My Card" to access it.',
        existingCustomerId: existing.id,
      });
      return;
    }

    let validHomeStoreId: string | null = null;
    if (homeStoreIdRaw) {
      const store = db
        .prepare('SELECT id FROM stores WHERE id = ? AND is_active = 1')
        .get(homeStoreIdRaw) as { id: string } | undefined;
      if (store) validHomeStoreId = store.id;
    }
    if (!validHomeStoreId) {
      const firstStore = db
        .prepare('SELECT id FROM stores WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1')
        .get() as { id: string } | undefined;
      validHomeStoreId = firstStore?.id || null;
    }

    const now = new Date().toISOString();
    const customerId = generateUniqueCustomerId();
    const qrCodeValue = `yos://customer/${customerId}`;

    db.prepare(
      `INSERT INTO customers (id, full_name, mobile_number, mobile_normalized, qr_code_value, home_store_id, is_blocked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(customerId, fullName, mobileRaw, mobileNormalized, qrCodeValue, validHomeStoreId, now, now);

    ensureCustomerStoreCards(customerId);
    broadcastEvent({ type: 'customer_registered', customerId, timestamp: now });

    const bundle = buildCustomerBundle(customerId);
    res.status(201).json(bundle);
  });

  // Customer lookup by mobile number or Customer ID
  app.post('/api/customers/lookup', (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query || query.length > 64) {
      res.status(400).json({ error: 'Enter your registered mobile number or Customer ID.' });
      return;
    }

    const normalizedId = normalizeCustomerIdInput(query);
    let customer = db
      .prepare('SELECT id FROM customers WHERE id = ?')
      .get(normalizedId) as { id: string } | undefined;

    if (!customer) {
      const mobileNormalized = normalizeMobile(query);
      if (mobileNormalized.replace(/\D/g, '').length >= 7) {
        customer = db
          .prepare('SELECT id FROM customers WHERE mobile_normalized = ?')
          .get(mobileNormalized) as { id: string } | undefined;
      }
    }

    if (!customer) {
      res.status(404).json({
        error: 'No YOS COLLECTION membership found for that mobile number or Customer ID.',
      });
      return;
    }

    const bundle = buildCustomerBundle(customer.id);
    res.json(bundle);
  });

  // Customer live card refresh (read-only)
  app.get('/api/customers/:customerId/card', (req, res) => {
    const normalizedId = normalizeCustomerIdInput(req.params.customerId || '');
    if (!CUSTOMER_ID_REGEX.test(normalizedId)) {
      res.status(400).json({ error: 'Invalid Customer ID format.' });
      return;
    }
    const bundle = buildCustomerBundle(normalizedId);
    if (!bundle) {
      res.status(404).json({ error: 'Customer card not found.' });
      return;
    }
    res.json(bundle);
  });

  // ================= OWNER AUTHENTICATION & PIN ROUTES =================

  app.post('/api/owner/login', (req, res) => {
    const ip = getClientIp(req);
    const limit = checkPinRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Too many incorrect PIN attempts. Try again in ${limit.retryAfterSec}s.`,
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!PIN_REGEX.test(pin)) {
      res.status(400).json({ error: 'Owner PIN must be 4 to 8 digits.' });
      return;
    }

    if (!verifyStoredOwnerPin(pin)) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Incorrect Owner PIN.' });
      return;
    }

    clearPinFailures(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + SESSION_TTL_MS;
    ownerSessions.set(token, { createdAt, expiresAt });

    res.json({
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  });

  app.post('/api/owner/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token) ownerSessions.delete(token);
    res.json({ success: true });
  });

  app.get('/api/owner/session', requireOwnerAuth, (_req, res) => {
    res.json({ authenticated: true });
  });

  app.post('/api/owner/change-pin', requireOwnerAuth, (req, res) => {
    const ip = getClientIp(req);
    const limit = checkPinRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Too many incorrect PIN attempts. Try again in ${limit.retryAfterSec}s.`,
      });
      return;
    }

    const currentPin = typeof req.body?.currentPin === 'string' ? req.body.currentPin.trim() : '';
    const newPin = typeof req.body?.newPin === 'string' ? req.body.newPin.trim() : '';
    const confirmNewPin = typeof req.body?.confirmNewPin === 'string' ? req.body.confirmNewPin.trim() : '';

    if (!PIN_REGEX.test(currentPin)) {
      res.status(400).json({ error: 'Please enter your current 4–8 digit PIN.' });
      return;
    }
    if (!PIN_REGEX.test(newPin)) {
      res.status(400).json({ error: 'New PIN must be 4 to 8 numeric digits.' });
      return;
    }
    if (newPin !== confirmNewPin) {
      res.status(400).json({ error: 'New PIN and confirmation PIN do not match.' });
      return;
    }
    if (newPin === currentPin) {
      res.status(400).json({ error: 'New PIN must be different from your current PIN.' });
      return;
    }

    if (!verifyStoredOwnerPin(currentPin)) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Current Owner PIN is incorrect.' });
      return;
    }

    clearPinFailures(ip);
    const { salt, hash } = hashPin(newPin);
    const now = new Date().toISOString();
    db.prepare('UPDATE owner_auth SET pin_salt = ?, pin_hash = ?, updated_at = ? WHERE id = 1').run(
      salt,
      hash,
      now
    );

    res.json({ success: true, updatedAt: now });
  });

  // ================= OWNER DASHBOARD & OPERATIONS =================

  app.get('/api/owner/dashboard', requireOwnerAuth, (req, res) => {
    const rawStoreId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : 'all';
    const filterStoreId = rawStoreId && rawStoreId !== 'all' ? rawStoreId : null;
    const globalReward = getGlobalRewardText();

    const storeRows = db.prepare('SELECT * FROM stores ORDER BY created_at ASC').all() as StoreRow[];
    const stores = storeRows.map((s) => formatStore(s, globalReward));

    const customerRows = db
      .prepare('SELECT * FROM customers ORDER BY created_at DESC')
      .all() as CustomerRow[];

    const cardRows = db
      .prepare(
        `SELECT sc.*, s.name as store_name, s.location as store_location, s.reward_override
         FROM stamp_cards sc
         JOIN stores s ON s.id = sc.store_id`
      )
      .all() as Array<{
        id: string;
        customer_id: string;
        store_id: string;
        store_name: string;
        store_location: string;
        reward_override: string | null;
        current_stamps: number;
        cycle_number: number;
        status: string;
        completed_at: string | null;
        redeemed_at: string | null;
        total_stamps_earned: number;
        total_cycles_completed: number;
        owner_notified: number;
        last_stamped_at: string | null;
        updated_at: string;
      }>;

    const cardsByCustomer = new Map<string, typeof cardRows>();
    for (const card of cardRows) {
      const list = cardsByCustomer.get(card.customer_id) || [];
      list.push(card);
      cardsByCustomer.set(card.customer_id, list);
    }

    const customers = customerRows.map((c) => {
      const cCards = cardsByCustomer.get(c.id) || [];
      const totalStamps = cCards.reduce((sum, card) => sum + card.total_stamps_earned, 0);
      const totalCompletedCycles = cCards.reduce((sum, card) => sum + card.total_cycles_completed, 0);
      const hasCompletedReward = cCards.some((card) => card.status === 'completed');
      const cards = cCards.map((card) => ({
        id: card.id,
        customerId: card.customer_id,
        storeId: card.store_id,
        storeName: card.store_name,
        storeLocation: card.store_location,
        rewardText: card.reward_override?.trim() || globalReward,
        currentStamps: card.current_stamps,
        cycleNumber: card.cycle_number,
        status: card.status as 'in_progress' | 'completed' | 'redeemed',
        completedAt: card.completed_at,
        redeemedAt: card.redeemed_at,
        totalStampsEarned: card.total_stamps_earned,
        totalCyclesCompleted: card.total_cycles_completed,
        ownerNotified: card.owner_notified === 1,
        lastStampedAt: card.last_stamped_at,
        updatedAt: card.updated_at,
      }));
      return {
        id: c.id,
        fullName: c.full_name,
        mobileNumber: c.mobile_number,
        qrCodeValue: c.qr_code_value,
        homeStoreId: c.home_store_id,
        isBlocked: c.is_blocked === 1,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        totalStampsEarned: totalStamps,
        totalCyclesCompleted: totalCompletedCycles,
        hasCompletedReward,
        cards,
      };
    });

    const filteredCards = filterStoreId
      ? cardRows.filter((c) => c.store_id === filterStoreId)
      : cardRows;

    const totalStampsIssued = (
      (filterStoreId
        ? db
            .prepare(`SELECT COUNT(*) as count FROM stamp_transactions WHERE action_type = 'stamp_added' AND store_id = ?`)
            .get(filterStoreId)
        : db
            .prepare(`SELECT COUNT(*) as count FROM stamp_transactions WHERE action_type = 'stamp_added'`)
            .get()) as { count: number }
    ).count;

    const completedRewardCards = (
      (filterStoreId
        ? db.prepare(`SELECT COUNT(*) as count FROM completed_cycles WHERE store_id = ?`).get(filterStoreId)
        : db.prepare(`SELECT COUNT(*) as count FROM completed_cycles`).get()) as { count: number }
    ).count;

    const pendingRedemptions = filteredCards.filter((c) => c.status === 'completed').length;
    const activeCustomers = customerRows.filter((c) => c.is_blocked === 0).length;

    const completionAlerts = db
      .prepare(
        `SELECT sc.customer_id, sc.store_id, sc.cycle_number, sc.completed_at, sc.status, sc.owner_notified,
                c.full_name, c.mobile_number, s.name as store_name, s.reward_override
         FROM stamp_cards sc
         JOIN customers c ON c.id = sc.customer_id
         JOIN stores s ON s.id = sc.store_id
         WHERE sc.status = 'completed'
         ${filterStoreId ? 'AND sc.store_id = ?' : ''}
         ORDER BY sc.completed_at DESC`
      )
      .all(...(filterStoreId ? [filterStoreId] : [])) as Array<{
        customer_id: string;
        store_id: string;
        cycle_number: number;
        completed_at: string;
        status: string;
        owner_notified: number;
        full_name: string;
        mobile_number: string;
        store_name: string;
        reward_override: string | null;
      }>;

    const recentTransactions = db
      .prepare(
        `SELECT t.*, c.full_name as customer_name, s.name as store_name
         FROM stamp_transactions t
         JOIN customers c ON c.id = t.customer_id
         JOIN stores s ON s.id = t.store_id
         ${filterStoreId ? 'WHERE t.store_id = ?' : ''}
         ORDER BY t.created_at DESC
         LIMIT 30`
      )
      .all(...(filterStoreId ? [filterStoreId] : [])) as Array<{
        id: string;
        customer_id: string;
        customer_name: string;
        store_id: string;
        store_name: string;
        cycle_number: number;
        action_type: string;
        stamp_number: number | null;
        note: string | null;
        created_at: string;
      }>;

    res.json({
      rewardText: globalReward,
      stores,
      kpis: {
        totalStampsIssued,
        completedRewardCards,
        totalCustomers: customerRows.length,
        activeCustomers,
        pendingRedemptions,
      },
      analytics: buildAnalytics(filterStoreId),
      completionAlerts: completionAlerts.map((a) => ({
        customerId: a.customer_id,
        customerName: a.full_name,
        mobileNumber: a.mobile_number,
        storeId: a.store_id,
        storeName: a.store_name,
        cycleNumber: a.cycle_number,
        rewardText: a.reward_override?.trim() || globalReward,
        completedAt: a.completed_at,
        unread: a.owner_notified === 1,
      })),
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        customerId: t.customer_id,
        customerName: t.customer_name,
        storeId: t.store_id,
        storeName: t.store_name,
        cycleNumber: t.cycle_number,
        actionType: t.action_type,
        stampNumber: t.stamp_number,
        note: t.note,
        createdAt: t.created_at,
      })),
      customers,
    });
  });

  // Owner lookup single customer by ID, QR value, or mobile number
  app.get('/api/owner/customers/:identifier', requireOwnerAuth, (req, res) => {
    const raw = decodeURIComponent(req.params.identifier || '').trim();
    if (!raw || raw.length > 100) {
      res.status(400).json({ error: 'Invalid customer identifier.' });
      return;
    }

    const normalizedId = normalizeCustomerIdInput(raw);
    let customer = db
      .prepare('SELECT id FROM customers WHERE id = ?')
      .get(normalizedId) as { id: string } | undefined;

    if (!customer) {
      const mobileNorm = normalizeMobile(raw);
      if (mobileNorm.replace(/\D/g, '').length >= 7) {
        customer = db
          .prepare('SELECT id FROM customers WHERE mobile_normalized = ?')
          .get(mobileNorm) as { id: string } | undefined;
      }
    }

    if (!customer) {
      res.status(404).json({ error: 'No registered customer matches this QR code or ID.' });
      return;
    }

    res.json(buildCustomerBundle(customer.id));
  });

  // Add exactly 1 stamp (requires Owner Bearer Session + Per-Stamp Owner PIN + Duplicate Guard)
  app.post('/api/owner/stamps/add', requireOwnerAuth, (req, res) => {
    const ip = getClientIp(req);
    const limit = checkPinRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Too many incorrect PIN attempts. Try again in ${limit.retryAfterSec}s.`,
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    const customerId = normalizeCustomerIdInput(
      typeof req.body?.customerId === 'string' ? req.body.customerId : ''
    );
    const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';
    const idempotencyKey =
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 140) : null;

    if (!CUSTOMER_ID_REGEX.test(customerId) || !storeId) {
      res.status(400).json({ error: 'Valid customer ID and store location are required.' });
      return;
    }

    if (!verifyStoredOwnerPin(pin)) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Invalid Owner PIN. Stamp authorization denied.' });
      return;
    }
    clearPinFailures(ip);

    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
        res.status(409).json({
          error: 'Duplicate stamp request blocked. This scan has already been processed.',
        });
        return;
      }
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as
      | CustomerRow
      | undefined;
    if (!customer) {
      res.status(404).json({ error: 'Customer account not found.' });
      return;
    }
    if (customer.is_blocked === 1) {
      res.status(403).json({
        error: 'This customer account is currently disabled. Re-enable it before adding stamps.',
      });
      return;
    }

    const store = db.prepare('SELECT * FROM stores WHERE id = ? AND is_active = 1').get(storeId) as
      | StoreRow
      | undefined;
    if (!store) {
      res.status(404).json({ error: 'Selected store location is unavailable.' });
      return;
    }

    ensureCustomerStoreCards(customerId);
    const cardId = `${customerId}__${storeId}`;
    const card = db.prepare('SELECT * FROM stamp_cards WHERE id = ?').get(cardId) as
      | {
          id: string;
          current_stamps: number;
          cycle_number: number;
          status: string;
          total_stamps_earned: number;
          total_cycles_completed: number;
          last_stamped_at: string | null;
        }
      | undefined;

    if (!card) {
      res.status(500).json({ error: 'Unable to load customer stamp card for this store.' });
      return;
    }

    if (card.current_stamps >= 6 || card.status !== 'in_progress') {
      res.status(409).json({
        error:
          'This 6-stamp card is already complete. Redeem the reward and start a new 6-stamp cycle first.',
      });
      return;
    }

    if (card.last_stamped_at) {
      const elapsed = Date.now() - new Date(card.last_stamped_at).getTime();
      if (elapsed >= 0 && elapsed < STAMP_COOLDOWN_MS) {
        res.status(409).json({
          error: 'Duplicate stamp prevented. Wait a few seconds before stamping this card again.',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const nextStampNumber = card.current_stamps + 1;
    const isCompletedNow = nextStampNumber === 6;
    const nextStatus = isCompletedNow ? 'completed' : 'in_progress';
    const effectiveReward = store.reward_override?.trim() || getGlobalRewardText();
    const txId = `TX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const applyStamp = db.transaction(() => {
      db.prepare(
        `UPDATE stamp_cards
         SET current_stamps = ?,
             status = ?,
             completed_at = ?,
             total_stamps_earned = total_stamps_earned + 1,
             total_cycles_completed = total_cycles_completed + ?,
             owner_notified = ?,
             last_stamped_at = ?,
             updated_at = ?
         WHERE id = ? AND current_stamps = ? AND status = 'in_progress'`
      ).run(
        nextStampNumber,
        nextStatus,
        isCompletedNow ? now : null,
        isCompletedNow ? 1 : 0,
        isCompletedNow ? 1 : 0,
        now,
        now,
        cardId,
        card.current_stamps
      );

      db.prepare(
        `INSERT INTO stamp_transactions (id, customer_id, store_id, cycle_number, action_type, stamp_number, note, created_at)
         VALUES (?, ?, ?, ?, 'stamp_added', ?, ?, ?)`
      ).run(txId, customerId, storeId, card.cycle_number, nextStampNumber, note, now);

      if (isCompletedNow) {
        const cycleRecordId = `CYC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        db.prepare(
          `INSERT INTO completed_cycles (id, customer_id, store_id, cycle_number, stamps_count, reward_text, completed_at)
           VALUES (?, ?, ?, ?, 6, ?, ?)`
        ).run(cycleRecordId, customerId, storeId, card.cycle_number, effectiveReward, now);

        const completeTxId = `TX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        db.prepare(
          `INSERT INTO stamp_transactions (id, customer_id, store_id, cycle_number, action_type, stamp_number, note, created_at)
           VALUES (?, ?, ?, ?, 'card_completed', 6, ?, ?)`
        ).run(completeTxId, customerId, storeId, card.cycle_number, `Completed 6 stamps · ${effectiveReward}`, now);
      }
    });

    applyStamp();

    const responsePayload = {
      success: true,
      transactionId: txId,
      stampNumber: nextStampNumber,
      completed: isCompletedNow,
      storeId,
      storeName: store.name,
      rewardText: effectiveReward,
      bundle: buildCustomerBundle(customerId),
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { timestamp: Date.now(), payload: responsePayload });
    }

    broadcastEvent({
      type: 'stamp_updated',
      customerId,
      storeId,
      actionType: isCompletedNow ? 'card_completed' : 'stamp_added',
      timestamp: now,
    });

    res.json(responsePayload);
  });

  // Redeem a completed 6-stamp reward (requires Owner Bearer + Owner PIN)
  app.post('/api/owner/rewards/redeem', requireOwnerAuth, (req, res) => {
    const ip = getClientIp(req);
    const limit = checkPinRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Too many incorrect PIN attempts. Try again in ${limit.retryAfterSec}s.`,
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    const customerId = normalizeCustomerIdInput(
      typeof req.body?.customerId === 'string' ? req.body.customerId : ''
    );
    const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';

    if (!verifyStoredOwnerPin(pin)) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Invalid Owner PIN.' });
      return;
    }
    clearPinFailures(ip);

    const cardId = `${customerId}__${storeId}`;
    const card = db.prepare('SELECT * FROM stamp_cards WHERE id = ?').get(cardId) as
      | { id: string; current_stamps: number; cycle_number: number; status: string }
      | undefined;

    if (!card || card.current_stamps < 6 || card.status !== 'completed') {
      res.status(409).json({ error: 'This card does not have an unredeemed 6-stamp reward.' });
      return;
    }

    const now = new Date().toISOString();
    const txId = `TX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const redeemTx = db.transaction(() => {
      db.prepare(
        `UPDATE stamp_cards
         SET status = 'redeemed', redeemed_at = ?, owner_notified = 0, updated_at = ?
         WHERE id = ?`
      ).run(now, now, cardId);

      db.prepare(
        `UPDATE completed_cycles
         SET redeemed_at = ?
         WHERE customer_id = ? AND store_id = ? AND cycle_number = ? AND redeemed_at IS NULL`
      ).run(now, customerId, storeId, card.cycle_number);

      db.prepare(
        `INSERT INTO stamp_transactions (id, customer_id, store_id, cycle_number, action_type, stamp_number, note, created_at)
         VALUES (?, ?, ?, ?, 'reward_redeemed', 6, 'Reward marked as redeemed by owner', ?)`
      ).run(txId, customerId, storeId, card.cycle_number, now);
    });

    redeemTx();
    broadcastEvent({
      type: 'stamp_updated',
      customerId,
      storeId,
      actionType: 'reward_redeemed',
      timestamp: now,
    });

    res.json({ success: true, bundle: buildCustomerBundle(customerId) });
  });

  // Start next 6-stamp cycle after completion (preserves completed cycle history)
  app.post('/api/owner/cycles/start', requireOwnerAuth, (req, res) => {
    const ip = getClientIp(req);
    const limit = checkPinRateLimit(ip);
    if (!limit.allowed) {
      res.status(429).json({
        error: `Too many incorrect PIN attempts. Try again in ${limit.retryAfterSec}s.`,
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    const customerId = normalizeCustomerIdInput(
      typeof req.body?.customerId === 'string' ? req.body.customerId : ''
    );
    const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';

    if (!verifyStoredOwnerPin(pin)) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Invalid Owner PIN.' });
      return;
    }
    clearPinFailures(ip);

    const cardId = `${customerId}__${storeId}`;
    const card = db.prepare('SELECT * FROM stamp_cards WHERE id = ?').get(cardId) as
      | { id: string; current_stamps: number; cycle_number: number; status: string }
      | undefined;

    if (!card || card.current_stamps < 6 || (card.status !== 'completed' && card.status !== 'redeemed')) {
      res.status(409).json({
        error: 'A new stamp cycle can only be started after all 6 stamps are completed.',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextCycle = card.cycle_number + 1;
    const txId = `TX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const startCycleTx = db.transaction(() => {
      db.prepare(
        `UPDATE completed_cycles
         SET started_new_cycle_at = ?
         WHERE customer_id = ? AND store_id = ? AND cycle_number = ?`
      ).run(now, customerId, storeId, card.cycle_number);

      db.prepare(
        `UPDATE stamp_cards
         SET current_stamps = 0,
             cycle_number = ?,
             status = 'in_progress',
             completed_at = NULL,
             redeemed_at = NULL,
             owner_notified = 0,
             updated_at = ?
         WHERE id = ?`
      ).run(nextCycle, now, cardId);

      db.prepare(
        `INSERT INTO stamp_transactions (id, customer_id, store_id, cycle_number, action_type, stamp_number, note, created_at)
         VALUES (?, ?, ?, ?, 'cycle_started', 0, ?, ?)`
      ).run(txId, customerId, storeId, nextCycle, `Started Cycle ${nextCycle} (previous cycle archived)`, now);
    });

    startCycleTx();
    broadcastEvent({
      type: 'stamp_updated',
      customerId,
      storeId,
      actionType: 'cycle_started',
      timestamp: now,
    });

    res.json({ success: true, cycleNumber: nextCycle, bundle: buildCustomerBundle(customerId) });
  });

  // Edit customer details or block/unblock account
  app.patch('/api/owner/customers/:customerId', requireOwnerAuth, (req, res) => {
    const customerId = normalizeCustomerIdInput(req.params.customerId || '');
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as
      | CustomerRow
      | undefined;
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    let nextName = customer.full_name;
    let nextMobile = customer.mobile_number;
    let nextMobileNorm = customer.mobile_normalized;
    let nextBlocked = customer.is_blocked;

    if (typeof req.body?.fullName === 'string') {
      const trimmed = req.body.fullName.trim();
      if (trimmed.length < 2 || trimmed.length > 80) {
        res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
        return;
      }
      nextName = trimmed;
    }

    if (typeof req.body?.mobileNumber === 'string') {
      const trimmed = req.body.mobileNumber.trim();
      const norm = normalizeMobile(trimmed);
      const digits = norm.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        res.status(400).json({ error: 'Mobile number must contain 7 to 15 digits.' });
        return;
      }
      const conflict = db
        .prepare('SELECT id FROM customers WHERE mobile_normalized = ? AND id != ?')
        .get(norm, customerId);
      if (conflict) {
        res.status(409).json({ error: 'Another customer is already registered with this mobile number.' });
        return;
      }
      nextMobile = trimmed;
      nextMobileNorm = norm;
    }

    if (typeof req.body?.isBlocked === 'boolean') {
      nextBlocked = req.body.isBlocked ? 1 : 0;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE customers
       SET full_name = ?, mobile_number = ?, mobile_normalized = ?, is_blocked = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextName, nextMobile, nextMobileNorm, nextBlocked, now, customerId);

    broadcastEvent({ type: 'customer_updated', customerId, timestamp: now });
    res.json({ success: true, bundle: buildCustomerBundle(customerId) });
  });

  // Update global editable reward text
  app.put('/api/owner/settings', requireOwnerAuth, (req, res) => {
    const rewardText = typeof req.body?.rewardText === 'string' ? req.body.rewardText.trim() : '';
    if (rewardText.length < 3 || rewardText.length > 140) {
      res.status(400).json({ error: 'Reward offer text must be between 3 and 140 characters.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('reward_text', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(rewardText, now);

    broadcastEvent({ type: 'settings_updated', timestamp: now });
    res.json({ success: true, rewardText, updatedAt: now });
  });

  // Create a new boutique store location
  app.post('/api/owner/stores', requireOwnerAuth, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
    const rewardOverrideRaw =
      typeof req.body?.rewardOverride === 'string' ? req.body.rewardOverride.trim() : '';

    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Store name must be 2 to 60 characters.' });
      return;
    }
    if (location.length < 2 || location.length > 80) {
      res.status(400).json({ error: 'Store address or district must be 2 to 80 characters.' });
      return;
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const id = `yos-${slug || 'branch'}-${crypto.randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();
    const rewardOverride = rewardOverrideRaw.length > 0 ? rewardOverrideRaw.slice(0, 140) : null;

    db.prepare(
      `INSERT INTO stores (id, name, location, reward_override, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run(id, name, location, rewardOverride, now);

    broadcastEvent({ type: 'stores_updated', storeId: id, timestamp: now });
    const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow;
    res.status(201).json({ store: formatStore(row, getGlobalRewardText()) });
  });

  // Update boutique store location
  app.patch('/api/owner/stores/:storeId', requireOwnerAuth, (req, res) => {
    const storeId = (req.params.storeId || '').trim();
    const existing = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as StoreRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Store location not found.' });
      return;
    }

    const name =
      typeof req.body?.name === 'string' && req.body.name.trim().length >= 2
        ? req.body.name.trim().slice(0, 60)
        : existing.name;
    const location =
      typeof req.body?.location === 'string' && req.body.location.trim().length >= 2
        ? req.body.location.trim().slice(0, 80)
        : existing.location;
    const rewardOverride =
      req.body?.rewardOverride === null || req.body?.rewardOverride === ''
        ? null
        : typeof req.body?.rewardOverride === 'string'
        ? req.body.rewardOverride.trim().slice(0, 140)
        : existing.reward_override;
    const isActive =
      typeof req.body?.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : existing.is_active;

    if (isActive === 0) {
      const activeCount = (
        db.prepare('SELECT COUNT(*) as count FROM stores WHERE is_active = 1 AND id != ?').get(storeId) as {
          count: number;
        }
      ).count;
      if (activeCount === 0) {
        res.status(400).json({ error: 'At least one boutique location must remain active.' });
        return;
      }
    }

    db.prepare(
      'UPDATE stores SET name = ?, location = ?, reward_override = ?, is_active = ? WHERE id = ?'
    ).run(name, location, rewardOverride, isActive, storeId);

    const now = new Date().toISOString();
    broadcastEvent({ type: 'stores_updated', storeId, timestamp: now });
    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as StoreRow;
    res.json({ store: formatStore(updated, getGlobalRewardText()) });
  });

  // Mount Vite middleware in development or static dist in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YOS COLLECTION server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start YOS COLLECTION server:', err);
  process.exit(1);
});
