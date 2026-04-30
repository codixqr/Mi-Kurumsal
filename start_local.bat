@echo off
title Mi Kurumsal CRM - Yerel Calistirma
echo [1/3] Baglanti degiskenleri ayarlaniyor...

:: Veritabanı ve Auth Ayarları
set DATABASE_URL=postgres://0ad10acbb413db9fab67e203ff36a30aac864d661d3e3b227e000ebfac2cd381:sk_0LH453SsHNUci2kRrP87s@pooled.db.prisma.io:5432/postgres?sslmode=require
set JWT_SECRET=degistir_beni_cok_guclu_bir_anahtar
set PORT=3000

echo [2/3] Bagimli kutuphaneler kontrol ediliyor...
:: npm install (Opsiyonel, eğer eksikse çalıştırabilirsiniz)

echo [3/3] Uygulama baslatiliyor (Localhost:3000)...
echo.
echo Paneliniz hazir oldugunda http://localhost:3000 adresinden erisebilirsiniz.
echo.

npm run dev

pause
