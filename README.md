# Mi Kurumsal CRM

Mi Kurumsal için uçtan uca CRM sistemi:

- Kullanıcı giriş/kayıt (JWT tabanlı)
- PostgreSQL veritabanı
- Yatırımcı, Marka, Lokasyon, Proje, Sözleşme, Görev CRUD
- Eşleştirme algoritması (Bütçe %30, Şehir %25, Sektör %25, m² %20)
- Excel dışa aktarma (modül bazlı ve toplu)
- WhatsApp + E-posta otomasyon tetikleri (env ile aktif)
- Activity timeline (kim, neyi, ne zaman değiştirdi)
- Soft delete + geri alma (recycle bin)
- Filtreli dönemsel KPI raporları
- WhatsApp/Mail şablon yönetim paneli

## Teknoloji

- Frontend: Vanilla HTML/CSS/JS
- Backend: Node.js + Express
- DB: PostgreSQL

## Kurulum

1. Bağımlılıkları yükle:

```bash
npm install
```

2. `.env.example` dosyasını `.env` olarak kopyala ve düzenle.

3. PostgreSQL'de veritabanı oluştur:

```sql
CREATE DATABASE mikurumsal_crm;
```

Alternatif (Docker):

```bash
npm run db:up
```

4. Sunucuyu başlat:

```bash
npm start
```

5. Tarayıcıdan aç:

`http://localhost:3000`

## Failed to fetch Hatası

Girişte `Failed to fetch` alırsan genelde sebep backend veya veritabanının kapalı olmasıdır:

1. PostgreSQL açık mı kontrol et (`npm run db:up` kullanabilirsin)
2. Sunucu çalışıyor mu kontrol et (`npm start`)
3. Sağlık kontrolü: `http://localhost:3000/api/health`

## Varsayılan Admin

`.env` değişmediği durumda:

- E-posta: `admin@mikurumsal.com`
- Şifre: `Admin123*`

## Otomasyon

`AUTOMATION_ENABLED=true` olduğunda:

- Yeni lead açılışında bildirim
- Proje açılışında bildirim
- Sözleşme kaydında bildirim

E-posta ve WhatsApp ayarları `.env` üzerinden yönetilir.
