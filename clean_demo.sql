-- ====================================================================
-- MI KURUMSAL CRM - DEMO VERİLERİNİ TEMİZLEME SQL SCRİPTİ
-- ====================================================================
-- Bu script SADECE demo seed fonksiyonları ile eklenen kayıtları siler.
-- Gerçek kullanıcılar, ayarlar ve gerçek veriler KESİNLİKLE KORUNUR.
-- ====================================================================

BEGIN;

-- 0. GÜVENLİK YEDEĞİ (Otomatik Snapshot Tablosu)
CREATE TABLE IF NOT EXISTS demo_cleanup_backups (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  note TEXT,
  backup_payload JSONB
);

-- Silme öncesi mevcut tüm verileri JSON olarak demo_cleanup_backups tablosuna arşivle
INSERT INTO demo_cleanup_backups(note, backup_payload)
SELECT 'Demo temizleme oncesi guvenlik snapshot yedegi', json_build_object(
  'investors', (SELECT json_agg(t) FROM investors t),
  'brands', (SELECT json_agg(t) FROM brands t),
  'locations', (SELECT json_agg(t) FROM locations t),
  'projects', (SELECT json_agg(t) FROM projects t),
  'contracts', (SELECT json_agg(t) FROM contracts t),
  'tasks', (SELECT json_agg(t) FROM tasks t),
  'finance_records', (SELECT json_agg(t) FROM finance_records t),
  'team_members', (SELECT json_agg(t) FROM team_members t)
);

-- 1. Demo Tanımlayıcı Geçici Tabloları
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

-- 2. Finans ve Ödeme Planları (Demo sözleşmelere ve açıklamalara bağlı)
DELETE FROM payment_plans 
WHERE finance_record_id IN (
  SELECT id FROM finance_records 
  WHERE contract_id IN (SELECT id FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont))
     OR description IN ('Franchise giriş bedeli - 1. taksit', 'Açılış danışmanlık ücreti', 'Şubat danışmanlık ödemesi', 'Mart danışmanlık ödemesi', 'Nisan danışmanlık ödemesi', 'Mayıs danışmanlık ödemesi', 'Master franchise giriş bedeli - 1. taksit %50', 'Kurulum danışmanlık ücreti', 'Ön anlaşma kaparo bedeli', 'Franchise giriş bedeli - sözleşme imzası sonrası')
);

DELETE FROM finance_records 
WHERE contract_id IN (SELECT id FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont))
   OR description IN ('Franchise giriş bedeli - 1. taksit', 'Açılış danışmanlık ücreti', 'Şubat danışmanlık ödemesi', 'Mart danışmanlık ödemesi', 'Nisan danışmanlık ödemesi', 'Mayıs danışmanlık ödemesi', 'Master franchise giriş bedeli - 1. taksit %50', 'Kurulum danışmanlık ücreti', 'Ön anlaşma kaparo bedeli', 'Franchise giriş bedeli - sözleşme imzası sonrası');

-- 3. Demo Görevler
DELETE FROM tasks 
WHERE title IN (SELECT title FROM temp_demo_tasks)
   OR note IN (SELECT title FROM temp_demo_tasks)
   OR note LIKE 'Ilk temas kur: %'
   OR note LIKE 'Marka analizini tamamla: %'
   OR note LIKE 'Analiz yap: %';

-- 4. Yatırımcı Toplantıları, Eşleştirmeler, Müşteri K/Z
DELETE FROM investor_meetings WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));
DELETE FROM investor_brand_matches WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv)) OR brand_id IN (SELECT id FROM brands WHERE name IN (SELECT name FROM temp_demo_brand));
DELETE FROM customer_pnl_revenues WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));
DELETE FROM customer_pnl_expenses WHERE investor_id IN (SELECT id FROM investors WHERE name IN (SELECT name FROM temp_demo_inv));

-- 5. Marka Sözleşmeleri
DELETE FROM brand_agreements WHERE brand_id IN (SELECT id FROM brands WHERE name IN (SELECT name FROM temp_demo_brand));

-- 6. Sözleşmeler
DELETE FROM contracts WHERE name IN (SELECT name FROM temp_demo_cont) OR note IN (SELECT name FROM temp_demo_cont);

-- 7. Projeler
DELETE FROM projects WHERE name IN (SELECT name FROM temp_demo_proj);

-- 8. Lokasyonlar
DELETE FROM locations WHERE name IN (SELECT name FROM temp_demo_loc);

-- 9. Markalar
DELETE FROM brands WHERE name IN (SELECT name FROM temp_demo_brand);

-- 10. Yatırımcılar
DELETE FROM investors WHERE name IN (SELECT name FROM temp_demo_inv);

-- 11. Ekip Üyeleri
DELETE FROM team_members 
WHERE email IN ('selin@micore.com', 'mert@micore.com', 'ayse@micore.com', 'burak@micore.com', 'esra@micore.com', 'kemal@micore.com')
   OR name IN ('Selin Demir', 'Mert Kaya', 'Ayşe Çetin', 'Burak Yılmaz', 'Esra Koç', 'Kemal Erdoğan');

-- 12. PnL Kayıtları (Demo şube 'Genel' ve demo personel)
DELETE FROM pnl_personnel WHERE person_name IN ('Selin Demir', 'Mert Kaya', 'Ayşe Çetin', 'Burak Yılmaz', 'Esra Koç', 'Kemal Erdoğan');
DELETE FROM pnl_revenues WHERE branch = 'Genel' AND source = 'Manuel' AND year_value = 2026 AND description IN ('Aylık toplam ciro', 'Paket servis gelirleri');
DELETE FROM pnl_expenses WHERE branch = 'Genel' AND source = 'Manuel' AND year_value = 2026 AND description LIKE '%giderleri';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pnl') THEN
    DELETE FROM pnl WHERE year_value = 2024 AND month_name IN ('OCAK', 'ŞUBAT', 'MART');
  END IF;
END $$;

-- 13. Demo Aktivite Logları
DELETE FROM activity_logs WHERE summary IN ('Yeni yatırımcı: Mustafa Kemal eklendi', 'Burger Master franchise bedeli güncellendi', 'Nişantaşı projesi İnşaat aşamasına geçti');

COMMIT;
