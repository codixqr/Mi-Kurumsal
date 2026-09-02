const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

// 12. Database Health Check API

// 13. Database Auto-Fix API (Güçlendirilmiş)

// LEGACY - kept for compatibility
router.get("/db-status", async (req, res) => {
  try {
    const pg = pool;
    const tables = ['users', 'investors', 'brands', 'locations', 'projects', 'contracts', 'tasks', 'pnl_reports', 'message_templates', 'activity_logs'];
    const status = {};
    for (const table of tables) {
      const columnsRes = await pg.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      status[table] = columnsRes.rows.map(r => r.column_name);
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// 13. Database Auto-Fix API (Güçlendirilmiş)
router.post("/db-fix", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const pg = pool;
    console.log("Database repair started...");

    // Önce tabloların var olduğundan emin olalım (schema.sql'den temel yapılar)
    const createTables = ["CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS investors (id SERIAL PRIMARY KEY, name TEXT, budget BIGINT, city TEXT, sector TEXT, investment_type TEXT, pipeline_stage TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT, sector TEXT, min_budget BIGINT, max_budget BIGINT, min_sqm INTEGER, max_sqm INTEGER, target_locations TEXT, active BOOLEAN, monthly_growth INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS locations (id SERIAL PRIMARY KEY, name TEXT, location_type TEXT, sqm INTEGER, rent BIGINT, potential TEXT, recommended_brands TEXT[], created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT, type TEXT, owner_team TEXT, priority TEXT, progress INTEGER, stage TEXT, due_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS contracts (id SERIAL PRIMARY KEY, note TEXT, contract_type TEXT, status TEXT, counterparty TEXT, start_date DATE, end_date DATE, amount BIGINT, currency TEXT, file_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, note TEXT, status TEXT, assignee_name TEXT, assignee_id INTEGER, priority TEXT, due_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS team_members (id SERIAL PRIMARY KEY, name TEXT, email TEXT, phone TEXT, department TEXT, role_name TEXT, permissions TEXT[], active BOOLEAN, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS app_settings (id SERIAL PRIMARY KEY, setting_key TEXT UNIQUE, setting_value JSONB, updated_by INTEGER, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS pnl (id SERIAL PRIMARY KEY, month_name TEXT, year_value INTEGER, revenue BIGINT, expense BIGINT, profit BIGINT, note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS message_templates (id SERIAL PRIMARY KEY, channel TEXT, event_name TEXT, title TEXT, body TEXT, active BOOLEAN, image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", "CREATE TABLE IF NOT EXISTS activity_logs (id SERIAL PRIMARY KEY, user_id INTEGER, user_name TEXT, module_name TEXT, action_type TEXT, summary TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"];
    for (const sql of createTables) {
      await pg.query(sql);
    }

    // Şimdi eksik sütunları ekleyelim
    const alters = ["ALTER TABLE investors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS phone TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS email TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS district TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS goal TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS contact_history TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS meeting_notes TEXT", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS follow_up_date DATE", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS documents TEXT[] NOT NULL DEFAULT '{}'", "ALTER TABLE investors ADD COLUMN IF NOT EXISTS created_by INTEGER", "ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'", "ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE locations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignees TEXT[] NOT NULL DEFAULT '{}'", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS checklist TEXT[] NOT NULL DEFAULT '{}'", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'", "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT", "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT", "ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS image_url TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE", "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT", "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT", "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER", "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT", "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE", "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_id INTEGER",
    // New PnL tables
    `CREATE TABLE IF NOT EXISTS pnl_revenues (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        revenue_type TEXT NOT NULL DEFAULT 'Satış',
        description TEXT,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`, `CREATE TABLE IF NOT EXISTS pnl_expenses (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        category TEXT NOT NULL DEFAULT 'Diğer',
        sub_category TEXT,
        description TEXT,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        revenue_ratio NUMERIC(10,4),
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`, `CREATE TABLE IF NOT EXISTS pnl_personnel (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        person_name TEXT NOT NULL,
        position TEXT,
        salary NUMERIC(14,2) NOT NULL DEFAULT 0,
        bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
        deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`, `CREATE TABLE IF NOT EXISTS pnl_field_mappings (
        id SERIAL PRIMARY KEY,
        source_header TEXT NOT NULL,
        mapped_category TEXT NOT NULL,
        mapped_type TEXT NOT NULL DEFAULT 'expense',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(source_header)
      )`];
    for (const sql of alters) {
      await pg.query(sql).catch(e => console.log("Alter skip or error:", e.message));
    }
    res.json({
      success: true,
      message: "Tablolar ve sütunlar başarıyla senkronize edildi."
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

router.get("/seed", authMiddleware, async (req, res) => {
  try {
    console.log("Manuel seed başlatıldı...");
    await seedDefaultDataIfNeeded();
    console.log("Manuel seed tamamlandı.");
    return res.json({
      success: true,
      message: "Tüm örnek veriler başarıyla yüklendi. Sayfaları yenileyebilirsiniz."
    });
  } catch (err) {
    console.error("Manuel seed hatası:", err);
    return res.status(500).json({
      error: err.message
    });
  }
});

// LEGACY - kept for compatibility

// LEGACY - kept for compatibility
router.get("/seed-legacy", authMiddleware, async (req, res) => {
  try {
    const pg = pool;
    console.log("Manual seeding started (legacy)...");

    // 1. Get an admin user id
    const adminRes = await pg.query("SELECT id FROM users LIMIT 1");
    if (adminRes.rowCount === 0) {
      return res.status(400).json({
        error: "Önce kayıt olmalısınız veya admin kullanıcısı oluşturulmalı."
      });
    }
    const adminId = adminRes.rows[0].id;

    // 2. Clear existing (Optional - let's just add new ones for safety)

    // 3. Seed Investors
    await pg.query(`
      INSERT INTO investors(name, budget, city, sector, investment_type, pipeline_stage, phone, email, created_by)
      VALUES 
      ('Mustafa Kemal', 7500000, 'İstanbul', 'Gıda', 'Franchise', 'Teklif Verildi', '+90 532 111 2233', 'mustafa@demo.com', $1),
      ('Ayşe Yılmaz', 3000000, 'Ankara', 'Perakende', 'Franchise', 'Yeni Lead', '+90 533 444 5566', 'ayse@demo.com', $1),
      ('Eren Holding', 25000000, 'İzmir', 'Teknoloji', 'Ortaklık', 'Sözleşme Süreci', '+90 212 777 8899', 'info@eren.com', $1),
      ('Selin Demir', 1500000, 'Bursa', 'Hizmet', 'Franchise', 'İletişim Kuruldu', '+90 544 222 3344', 'selin@demo.com', $1),
      ('Kaan Özkan', 10000000, 'Antalya', 'Turizm', 'Master Franchise', 'Analiz Yapıldı', '+90 505 111 0099', 'kaan@demo.com', $1)
    `, [adminId]);

    // 4. Seed Brands
    await pg.query(`
      INSERT INTO brands(name, sector, min_budget, max_budget, currency, min_sqm, max_sqm, target_locations, active, monthly_growth, agreement_status, location_type)
      VALUES 
      ('Burger Master', 'Gıda', 3000000, 6000000, 'TRY', 80, 200, 'İstanbul, Ankara', true, 12, 'Anlaşmalı', 'AVM'),
      ('Glow Beauty', 'Kozmetik', 1500000, 3000000, 'TRY', 40, 100, 'Ankara, İzmir', true, 8, 'Anlaşmalı', 'Cadde'),
      ('EduPlay', 'Eğitim', 5000000, 12000000, 'TRY', 300, 800, 'İstanbul', true, 15, 'Anlaşmalı', 'AVM'),
      ('AutoCheck', 'Otomotiv', 4000000, 8000000, 'TRY', 500, 1500, 'Bursa, Kocaeli', true, 5, 'Görüşülüyor', 'Sanayi'),
      ('Pizzasimo', 'Gıda', 2000000, 4500000, 'TRY', 60, 120, 'AVM, Cadde', true, 10, 'Beklemede', 'AVM')
    `);

    // 5. Seed Locations
    await pg.query(`
      INSERT INTO locations(name, location_type, sqm, rent, potential, recommended_brands)
      VALUES 
      ('İstinye Park AVM', 'AVM', 150, 18000, 'Çok Yüksek', ARRAY['Burger Master', 'Pizzasimo']),
      ('Kızılay Meydanı', 'Cadde', 80, 12000, 'Yüksek', ARRAY['Glow Beauty']),
      ('Terracity AVM', 'AVM', 450, 35000, 'Yüksek', ARRAY['EduPlay']),
      ('Nilüfer Sanayi', 'Sanayi', 1200, 45000, 'Orta', ARRAY['AutoCheck'])
    `);

    // 6. Seed Projects
    await pg.query(`
      INSERT INTO projects(name, project_type, owner_team, priority, progress, stage, due_date)
      VALUES 
      ('Burger Master AVM Projesi', 'Yeni Şube', 'Operasyon', 'Yüksek', 70, 'İnce İşler', NOW() + INTERVAL '15 days'),
      ('İzmir Bölge Bayiliği', 'Genişleme', 'İş Geliştirme', 'Orta', 30, 'Hukuk Onayı', NOW() + INTERVAL '45 days'),
      ('Glow Beauty Franchise', 'Yeni Şube', 'Satış', 'Orta', 90, 'Anahtar Teslim', NOW() + INTERVAL '5 days')
    `);

    // 7. Seed Tasks
    await pg.query(`
      INSERT INTO tasks(note, status)
      VALUES 
      ('Kira sözleşmesini imzalat', 'Açık'),
      ('Ekipman siparişlerini ver', 'Devam Ediyor'),
      ('Personel ilanını yayınla', 'Tamamlandı'),
      ('Marka tescil kontrolü yap', 'Açık')
    `);

    // 8. Seed PnL
    await pg.query(`
      INSERT INTO pnl(month_name, year_value, revenue, expense, profit, note)
      VALUES 
      ('OCAK', 2024, 1250000, 850000, 400000, 'Yılın ilk ayı performansı'),
      ('ŞUBAT', 2024, 1400000, 900000, 500000, 'Satışlarda artış'),
      ('MART', 2024, 1100000, 950000, 150000, 'Yüksek operasyonel giderler')
    `);

    // 9. Seed Contracts
    await pg.query(`
      INSERT INTO contracts(note, counterparty, amount, currency, status)
      VALUES 
      ('Ana Bayilik Sözleşmesi', 'Mustafa Kemal', 5000000, 'TRY', 'Onaylandı'),
      ('Kira Sözleşmesi - İstinye', 'Zorlu GYO', 150000, 'USD', 'İmzada')
    `);

    // 10. Seed Templates
    await pg.query(`
      INSERT INTO message_templates(channel, event_name, title, body, active)
      VALUES 
      ('whatsapp', 'Yeni Lead Karşılama', 'Merhaba Hoşgeldiniz', 'Sayın {{name}}, başvurunuz alınmıştır. En kısa sürede döneceğiz.', true),
      ('mail', 'Sözleşme Hatırlatma', 'Sözleşme Süreci Hakkında', 'Sözleşmeniz onay beklemektedir.', true)
    `);

    // 11. Seed Activity Logs
    await pg.query(`
      INSERT INTO activity_logs(user_id, user_name, module_name, action_type, summary)
      VALUES 
      ($1, 'Admin', 'Yatırımcılar', 'Ekleme', 'Yeni yatırımcı: Mustafa Kemal eklendi'),
      ($1, 'Admin', 'Markalar', 'Güncelleme', 'Burger Master franchise bedeli güncellendi'),
      ($1, 'Admin', 'Projeler', 'Aşama Değişikliği', 'Nişantaşı projesi İnşaat aşamasına geçti')
    `, [adminId]);
    console.log("Seeding successful!");
    res.json({
      success: true,
      message: "Veritabanı başarıyla demo verilerle dolduruldu. Artık panelleri kontrol edebilirsiniz."
    });
  } catch (err) {
    console.error("Seeding error:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
