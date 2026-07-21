import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && 
           !process.env.DATABASE_URL.includes('localhost') && 
           !process.env.DATABASE_URL.includes('127.0.0.1')
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
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'"
  ];

  for (const sql of alters) {
    await pg.query(sql).catch(() => {});
  }
}

export async function seedDefaultDataIfNeeded() {
  const pg = getPool();
  const adminEmail = process.env.ADMIN_EMAIL || "admin@mikurumsal.com";
  const adminPass = process.env.ADMIN_PASSWORD || "Admin123*";

  const userRes = await pg.query("SELECT * FROM users WHERE email = $1", [adminEmail]);
  if (userRes.rowCount === 0) {
    console.log("Seeding default data...");
    const hashed = await bcrypt.hash(adminPass, 10);
    const res = await pg.query(
      "INSERT INTO users(name, email, password, role) VALUES($1, $2, $3, $4) RETURNING id",
      ["Admin", adminEmail, hashed, "admin"]
    );
    const adminId = res.rows[0].id;

    // Seed Investors
    await pg.query(`
      INSERT INTO investors(name, budget, city, sector, investment_type, pipeline_stage, phone, created_by)
      VALUES 
      ('Ahmet Yılmaz', 5000000, 'İstanbul', 'Gıda', 'Franchise', 'Yeni Lead', '+90 532 000 0001', $1),
      ('Zeynep Demir', 12000000, 'Ankara', 'Eğitim', 'Master Franchise', 'Analiz Yapıldı', '+90 533 000 0002', $1)
    `, [adminId]);

    // Seed Brands
    await pg.query(`
      INSERT INTO brands(name, sector, min_budget, max_budget, min_sqm, max_sqm, target_locations, active)
      VALUES 
      ('Mi Coffee', 'Gıda', 2000000, 4000000, 50, 150, 'AVM, Cadde', true),
      ('FitWay Gym', 'Spor', 8000000, 15000000, 400, 1000, 'Merkezi Lokasyon', true)
    `);

    // Seed Projects
    await pg.query(`
      INSERT INTO projects(name, type, owner_team, priority, progress, stage, due_date)
      VALUES 
      ('Nişantaşı Şube Açılışı', 'Yeni Şube', 'Operasyon', 'Yüksek', 45, 'İnşaat Aşaması', NOW() + INTERVAL '30 days')
    `);

    // Seed Tasks
    await pg.query(`
      INSERT INTO tasks(note, status)
      VALUES ('Aylık raporları hazırla', 'Tamamlandı')
    `);
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
