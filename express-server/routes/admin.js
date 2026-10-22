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

// Demo verilerini temizleme fonksiyonu ve endpoint'i
async function performCleanDemoData(pgClient) {
  // 0. GÜVENLİK YEDEĞİ: Silme öncesi tüm tabloların anlık kopyasını al
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS demo_cleanup_backups (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      note TEXT,
      backup_payload JSONB
    );
  `);

  const tablesToBackup = ['investors', 'brands', 'locations', 'projects', 'contracts', 'tasks', 'finance_records', 'team_members', 'customer_pnl_revenues', 'customer_pnl_expenses'];
  const snapshotData = {};
  for (const tbl of tablesToBackup) {
    try {
      const res = await pgClient.query(`SELECT * FROM ${tbl}`);
      snapshotData[tbl] = res.rows;
    } catch (e) {
      // Tablo yoksa devam et
    }
  }
  await pgClient.query(
    `INSERT INTO demo_cleanup_backups(note, backup_payload) VALUES($1, $2)`,
    ['Demo temizleme öncesi otomatik alınan güvenlik yedeği', JSON.stringify(snapshotData)]
  );

  // 1. Temporary identifier tables
  await pgClient.query(`
    CREATE TEMP TABLE IF NOT EXISTS temp_demo_inv (name TEXT);
    TRUNCATE temp_demo_inv;
    INSERT INTO temp_demo_inv VALUES 
      ('Ahmet Kılıç'), ('Yaman Holding'), ('Melek Arslan'), ('Can Teknoloji A.Ş.'),
      ('Fatma Şahin'), ('Ömer Yıldız'), ('Grup Doruk Yatırım'), ('Deniz Acar'),
      ('Kardeşler Gıda Ltd.'), ('Hüseyin Toprak'), ('Mustafa Kemal'), ('Ayşe Yılmaz'),
      ('Eren Holding'), ('Selin Demir'), ('Kaan Özkan'), ('Ahmet Yılmaz'), ('Zeynep Demir');

    CREATE TEMP TABLE IF NOT EXISTS temp_demo_brand (name TEXT);
    TRUNCATE temp_demo_brand;
    INSERT INTO temp_demo_brand VALUES 
      ('Blak Coffee Co'), ('Tavada Tavuk'), ('SushiMore'), ('Kasap Döner'),
      ('The Coffee Factory'), ('Yelken Balıkçısı'), ('Bigye'), ('Mogaf Döner'),
      ('Cajun Corner'), ('Pasta Punto'), ('Pizza Pino'), ('Fit Salad Bar'),
      ('Coffee in Munchies'), ('Türk Kahvesi Evi'), ('Springfield Yeni Nesil Dürüm'),
      ('Springfield (Yeni Nesil Dürüm)'), ('Burger Master'), ('Glow Beauty'),
      ('EduPlay'), ('AutoCheck'), ('Pizzasimo'), ('Mi Coffee'), ('FitWay Gym');

    CREATE TEMP TABLE IF NOT EXISTS temp_demo_loc (name TEXT);
    TRUNCATE temp_demo_loc;
    INSERT INTO temp_demo_loc VALUES 
      ('Bağdat Caddesi Premium'), ('Panora AVM - A Blok F05'), ('Nişantaşı Köşk Pasajı'),
      ('Alsancak Turan Caddesi'), ('Forum Bornova - ZF12'), ('Lara Sahil Kavşağı'),
      ('Maslak İş Merkezi Zemin'), ('Bursa Zafer Plaza - Giriş'), ('İstinye Park AVM'),
      ('Kızılay Meydanı'), ('Terracity AVM'), ('Nilüfer Sanayi');

    CREATE TEMP TABLE IF NOT EXISTS temp_demo_proj (name TEXT);
    TRUNCATE temp_demo_proj;
    INSERT INTO temp_demo_proj VALUES 
      ('Blak Coffee Co - Bağdat Cad. Açılışı'), ('Tavada Tavuk - Panora AVM Franchise'),
      ('SushiMore - Nişantaşı Açılışı'), ('Yaman Holding - Fast Casual Ortaklık'),
      ('Grup Doruk - Master Franchise Anlaşması'), ('Melek Arslan - Kasap Döner İzmir'),
      ('Can Teknoloji - Kahve Zinciri Projesi'), ('Burger Master AVM Projesi'),
      ('İzmir Bölge Bayiliği'), ('Glow Beauty Franchise'), ('Nişantaşı Şube Açılışı');

    CREATE TEMP TABLE IF NOT EXISTS temp_demo_cont (name TEXT);
    TRUNCATE temp_demo_cont;
    INSERT INTO temp_demo_cont VALUES 
      ('Blak Coffee Co Franchise Sözleşmesi'), ('Tavada Tavuk Danışmanlık Sözleşmesi'),
      ('SushiMore Ön Anlaşma'), ('Grup Doruk Master Franchise Protokolü'),
      ('Can Teknoloji Danışmanlık Protokolü'), ('Ana Bayilik Sözleşmesi'),
      ('Kira Sözleşmesi - İstinye');

    CREATE TEMP TABLE IF NOT EXISTS temp_demo_tasks (title TEXT);
    TRUNCATE temp_demo_tasks;
    INSERT INTO temp_demo_tasks VALUES 
      ('Blak Coffee Co - Bağdat Cad. kira müzakeresi'),
      ('SushiMore franchise sözleşmesi imzalatma'),
      ('Yaman Holding finansal analiz raporu hazırla'),
      ('Panora AVM - Tavada Tavuk ruhsat başvurusu'),
      ('Grup Doruk master franchise sözleşme incelemesi'),
      ('Mayıs KPI ve pipeline raporu'),
      ('Nişantaşı lokasyon ekspertiz raporu'),
      ('Ahmet Kılıç - Blak Coffee Co sunum toplantısı hazırlığı'),
      ('Can Teknoloji sözleşme taslağı gönder'),
      ('Blak Coffee Co Web sitesi ve sosyal medya profil güncelleme'),
      ('Melek Arslan - Kasap Döner lokasyon shortlist'),
      ('Forum Bornova AVM kira müzakeresi'),
      ('Grup Doruk - imza töreni organizasyonu'),
      ('Haziran ayı tahsilat planı'),
      ('SushiMore personel eğitim programı koordinasyonu'),
      ('Kira sözleşmesini imzalat'),
      ('Ekipman siparişlerini ver'),
      ('Personel ilanını yayınla'),
      ('Marka tescil kontrolü yap'),
      ('Aylık raporları hazırla');
  `);

  // 2. Child tables first: Payment plans & Finance Records
  await pgClient.query(`
    DELETE FROM payment_plans 
    WHERE finance_record_id IN (
      SELECT id FROM finance_records 
      WHERE contract_id IN (SELECT id FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont))
         OR description IN ('Franchise giriş bedeli - 1. taksit', 'Açılış danışmanlık ücreti', 'Şubat danışmanlık ödemesi', 'Mart danışmanlık ödemesi', 'Nisan danışmanlık ödemesi', 'Mayıs danışmanlık ödemesi', 'Master franchise giriş bedeli - 1. taksit %50', 'Kurulum danışmanlık ücreti', 'Ön anlaşma kaparo bedeli', 'Franchise giriş bedeli - sözleşme imzası sonrası')
    );

    DELETE FROM finance_records 
    WHERE contract_id IN (SELECT id FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont))
       OR description IN ('Franchise giriş bedeli - 1. taksit', 'Açılış danışmanlık ücreti', 'Şubat danışmanlık ödemesi', 'Mart danışmanlık ödemesi', 'Nisan danışmanlık ödemesi', 'Mayıs danışmanlık ödemesi', 'Master franchise giriş bedeli - 1. taksit %50', 'Kurulum danışmanlık ücreti', 'Ön anlaşma kaparo bedeli', 'Franchise giriş bedeli - sözleşme imzası sonrası');
  `);

  // 3. Tasks
  await pgClient.query(`
    DELETE FROM tasks 
    WHERE title IN (SELECT title FROM temp_demo_tasks)
       OR note IN (SELECT title FROM temp_demo_tasks)
       OR note LIKE 'Ilk temas kur: %'
       OR note LIKE 'Marka analizini tamamla: %'
       OR note LIKE 'Analiz yap: %';
  `);

  // 4. Investor meetings, matches, customer pnl
  await pgClient.query(`
    DELETE FROM investor_meetings WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));
    DELETE FROM investor_brand_matches WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv)) OR brand_id IN (SELECT id FROM brands WHERE name IN (SELECT name FROM temp_demo_brand));
    DELETE FROM customer_pnl_revenues WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));
    DELETE FROM customer_pnl_expenses WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));
  `);

  // 5. Brand agreements
  await pgClient.query(`
    DELETE FROM brand_agreements WHERE brand_id IN (SELECT id FROM brands WHERE name IN (SELECT name FROM temp_demo_brand));
  `);

  // 6. Contracts
  await pgClient.query(`
    DELETE FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont) OR note IN (SELECT name FROM temp_demo_cont);
  `);

  // 7. Projects
  await pgClient.query(`
    DELETE FROM projects WHERE name IN (SELECT name FROM temp_demo_proj);
  `);

  // 8. Locations
  await pgClient.query(`
    DELETE FROM locations WHERE name IN (SELECT name FROM temp_demo_loc);
  `);

  // 9. Brands
  await pgClient.query(`
    DELETE FROM brands WHERE name IN (SELECT name FROM temp_demo_brand);
  `);

  // 10. Investors
  await pgClient.query(`
    DELETE FROM investors WHERE name IN (SELECT name FROM temp_demo_inv);
  `);

  // 11. Team Members
  await pgClient.query(`
    DELETE FROM team_members 
    WHERE email IN ('selin@micore.com', 'mert@micore.com', 'ayse@micore.com', 'burak@micore.com', 'esra@micore.com', 'kemal@micore.com')
       OR name IN ('Selin Demir', 'Mert Kaya', 'Ayşe Çetin', 'Burak Yılmaz', 'Esra Koç', 'Kemal Erdoğan');
  `);

  // 12. PnL Records
  await pgClient.query(`
    DELETE FROM pnl_personnel WHERE person_name IN ('Selin Demir', 'Mert Kaya', 'Ayşe Çetin', 'Burak Yılmaz', 'Esra Koç', 'Kemal Erdoğan');
    DELETE FROM pnl_revenues WHERE branch = 'Genel' AND source = 'Manuel' AND year_value = 2026 AND description IN ('Aylık toplam ciro', 'Paket servis gelirleri');
    DELETE FROM pnl_expenses WHERE branch = 'Genel' AND source = 'Manuel' AND year_value = 2026 AND description LIKE '%giderleri';
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pnl') THEN
        DELETE FROM pnl WHERE year_value = 2024 AND month_name IN ('OCAK', 'ŞUBAT', 'MART');
      END IF;
    END $$;
  `);

  // 13. Activity logs
  await pgClient.query(`
    DELETE FROM activity_logs WHERE summary IN ('Yeni yatırımcı: Mustafa Kemal eklendi', 'Burger Master franchise bedeli güncellendi', 'Nişantaşı projesi İnşaat aşamasına geçti');
  `);
}

router.post("/clean-demo", authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await performCleanDemoData(client);
    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Tüm demo veriler başarıyla temizlendi. Gerçek işletme verileri korundu."
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Clean demo error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/clean-demo", authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await performCleanDemoData(client);
    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Tüm demo veriler başarıyla temizlendi. Gerçek işletme verileri korundu."
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Clean demo error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/backup-download", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const tables = [
      'users', 'team_members', 'investors', 'brands', 'locations', 
      'projects', 'contracts', 'tasks', 'finance_records', 'payment_plans', 
      'investor_meetings', 'investor_brand_matches', 'brand_agreements',
      'customer_pnl_revenues', 'customer_pnl_expenses', 'pnl_revenues', 
      'pnl_expenses', 'pnl_personnel', 'message_templates', 'app_settings'
    ];
    const fullBackup = {
      exportDate: new Date().toISOString(),
      database: "mikurumsal_crm",
      tables: {}
    };

    for (const tbl of tables) {
      try {
        const queryRes = await pool.query(`SELECT * FROM ${tbl}`);
        // Mask passwords in users table for safety
        if (tbl === 'users') {
          fullBackup.tables[tbl] = queryRes.rows.map(u => ({ ...u, password_hash: '[PROTECTED]' }));
        } else {
          fullBackup.tables[tbl] = queryRes.rows;
        }
      } catch (err) {
        // Tablo henüz mevcut olmayabilir
        fullBackup.tables[tbl] = [];
      }
    }

    const filename = `mikurumsal_crm_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(JSON.stringify(fullBackup, null, 2));
  } catch (err) {
    console.error("Backup download error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
