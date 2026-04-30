import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('db.prisma.io')
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

export { getPool };

export async function initDb() {
  const pg = getPool();
  const schemaPath = path.join(process.cwd(), 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pg.query(schema);

  const alters = [
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS agreement_status TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS franchise_fee BIGINT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS royalty_rate NUMERIC(5,2)",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS contract_term_months INTEGER",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS initial_investment BIGINT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS branch_count INTEGER",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS contact_person TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS contact_phone TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS business_plan TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS operation_plan TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_steps TEXT[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS kpi_targets TEXT",
    "ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_notes TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS email TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS district TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS goal TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS contact_history TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS meeting_notes TEXT",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS follow_up_date DATE",
    "ALTER TABLE investors ADD COLUMN IF NOT EXISTS documents TEXT[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignees TEXT[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS checklist TEXT[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_name TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_data TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_mime_type TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS traffic TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_phone TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_name TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_data TEXT",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_url TEXT",
  ];

  for (const sql of alters) {
    await pg.query(sql).catch(() => {});
  }
}

export async function seedDefaultDataIfNeeded() {
  const pg = getPool();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mikurumsal.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123*';
  const adminName = process.env.ADMIN_NAME || 'CRM Admin';

  const existing = await pg.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pg.query(
      'INSERT INTO users(name, email, password_hash, role) VALUES($1,$2,$3,$4)',
      [adminName, adminEmail, hash, 'admin']
    );
  }

  const seedBrands = [
    ['Tavada Tavuk', 'Fast Casual', 1500000, 3500000, 90, 220, 'AVM + Cadde', true, 11],
    ['Bigye', 'Fast Casual', 1300000, 2900000, 70, 180, 'AVM', true, 9],
    ['Kasap Döner', 'Doner', 1200000, 2600000, 65, 150, 'Cadde', true, 8],
    ['Cajun Corner', 'Fast Casual', 1400000, 3100000, 80, 170, 'AVM + Cadde', true, 10],
    ['Springfield (Yeni Nesil Dürüm)', 'Doner', 1250000, 2500000, 60, 130, 'Cadde', true, 7],
    ['Yelken Balıkçısı', 'Seafood', 2000000, 5000000, 140, 350, 'Sahil + Premium Cadde', true, 6],
    ['Mogaf Döner', 'Doner', 1100000, 2100000, 50, 120, 'Cadde + Mahalle', true, 8],
    ['Blak Coffee Co', 'Coffee', 1700000, 3600000, 90, 180, 'Cadde + AVM', true, 13],
    ['The Coffee Factory', 'Coffee', 1400000, 3300000, 80, 170, 'AVM', true, 12],
    ['Coffee in Munchies', 'Coffee', 1300000, 2900000, 75, 160, 'Cadde + AVM', true, 9],
  ];

  for (const brand of seedBrands) {
    const exists = await pg.query('SELECT id FROM brands WHERE LOWER(name)=LOWER($1)', [brand[0]]);
    if (exists.rowCount > 0) continue;
    await pg.query(
      `INSERT INTO brands(name,sector,min_budget,max_budget,min_sqm,max_sqm,target_locations,active,monthly_growth) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      brand
    );
  }
}

let dbInitialized = false;
export async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    await seedDefaultDataIfNeeded();
    dbInitialized = true;
  }
}
