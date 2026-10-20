const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin } = require('../middlewares/auth');
const waha = require('../services/waha');

// Middleware to check permission (admin or whatsapp permission)
function canManageWhatsApp(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Yetkisiz erişim.' });
  }
  if (req.user.role === 'admin') {
    return next();
  }
  const permissions = req.user.permissions || [];
  if (permissions.includes('whatsapp') || permissions.includes('settings')) {
    return next();
  }
  return res.status(403).json({ message: 'WhatsApp yönetimi için yetkiniz bulunmuyor.' });
}

// 1. Get Settings
router.get('/settings', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const config = await waha.getWahaConfig(pool);
    res.json({
      success: true,
      config: {
        apiUrl: config.apiUrl,
        apiKey: config.apiKey ? '••••••••' : '',
        hasApiKey: Boolean(config.apiKey),
        session: config.session,
        countryCode: config.countryCode,
        enabled: config.enabled,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Save Settings
router.put('/settings', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { apiUrl, apiKey, session, countryCode, enabled } = req.body;
    
    // Existing config
    const currentConfig = await waha.getWahaConfig(pool);

    const newConfig = {
      apiUrl: (apiUrl !== undefined ? apiUrl : currentConfig.apiUrl || '').trim(),
      apiKey: apiKey && apiKey !== '••••••••' ? apiKey.trim() : currentConfig.apiKey,
      session: (session !== undefined ? session : currentConfig.session || 'default').trim(),
      countryCode: (countryCode !== undefined ? countryCode : currentConfig.countryCode || '90').trim(),
      enabled: enabled !== undefined ? Boolean(enabled) : currentConfig.enabled,
    };

    await pool.query(
      `INSERT INTO app_settings(setting_key, setting_value, updated_by, updated_at)
       VALUES('whatsapp', $1::jsonb, $2, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [JSON.stringify(newConfig), req.user.id]
    );

    res.json({ success: true, message: 'WhatsApp ayarları kaydedildi.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Status check
router.get('/status', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const status = await waha.checkStatus(pool);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Start session
router.post('/start-session', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const result = await waha.startSession(pool);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4.1 Get live QR image
router.get('/qr', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const config = await waha.getWahaConfig(pool);
    const session = config.session || 'micore';
    const url = `${config.apiUrl}/api/${encodeURIComponent(session)}/auth/qr`;

    const r = await fetch(url, {
      headers: {
        'X-Api-Key': config.apiKey,
      },
    });

    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: 'QR kod henüz hazır değil veya oturum zaten bağlı.' });
    }

    const buffer = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Send single test message
router.post('/send-test', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefon numarası gereklidir.' });
    }
    const testMsg = message || 'Merhaba! Bu Mi Core CRM üzerinden gönderilmiş bir WhatsApp test mesajıdır.';
    const result = await waha.sendText({
      phone,
      message: testMsg,
      recipientName: 'Test Alıcısı',
      customPool: pool,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Send general message
router.post('/send-message', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const { phone, message, recipientName, fileUrl, filename, caption } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefon numarası gereklidir.' });
    }

    if (fileUrl) {
      const result = await waha.sendFile({
        phone,
        fileUrl,
        filename: filename || 'dosya',
        caption: caption || message || '',
        recipientName: recipientName || null,
        customPool: pool,
      });
      return res.json(result);
    }

    if (!message) {
      return res.status(400).json({ success: false, error: 'Mesaj içeriği gereklidir.' });
    }

    const result = await waha.sendText({
      phone,
      message,
      recipientName: recipientName || null,
      customPool: pool,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Bulk / Broadcast Send
router.post('/broadcast', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const { targetType, targetId, message, delayMs = 250 } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Duyuru mesajı boş olamaz.' });
    }

    let recipients = [];

    if (targetType === 'single_investor' && targetId) {
      const r = await pool.query(
        'SELECT id, name, phone, whatsapp_phone, city, email FROM investors WHERE id = $1 AND deleted_at IS NULL',
        [targetId]
      );
      recipients = r.rows;
    } else if (targetType === 'investors_stage' && targetId) {
      const r = await pool.query(
        'SELECT id, name, phone, whatsapp_phone, city, email FROM investors WHERE pipeline_stage = $1 AND deleted_at IS NULL',
        [targetId]
      );
      recipients = r.rows;
    } else if (targetType === 'all_team') {
      const r = await pool.query(
        'SELECT id, name, phone, email FROM team_members WHERE phone IS NOT NULL AND phone != \'\''
      );
      recipients = r.rows;
    } else {
      // Default: all investors with phone
      const r = await pool.query(
        `SELECT id, name, phone, whatsapp_phone, city, email 
         FROM investors 
         WHERE deleted_at IS NULL 
           AND ((whatsapp_phone IS NOT NULL AND whatsapp_phone != '') OR (phone IS NOT NULL AND phone != ''))`
      );
      recipients = r.rows;
    }

    if (recipients.length === 0) {
      return res.status(404).json({ success: false, error: 'Telefonu kayıtlı alıcı bulunamadı.' });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const rec of recipients) {
      const phone = rec.whatsapp_phone || rec.phone;
      if (!phone) {
        failedCount++;
        continue;
      }

      // Variable substitution
      let personalized = message
        .replace(/\{\{name\}\}/gi, rec.name || 'Müşteri')
        .replace(/\{\{ad_soyad\}\}/gi, rec.name || 'Müşteri')
        .replace(/\{\{phone\}\}/gi, phone)
        .replace(/\{\{city\}\}/gi, rec.city || '');

      const result = await waha.sendText({
        phone,
        message: personalized,
        recipientName: rec.name || null,
        customPool: pool,
      });

      if (result.success) {
        sentCount++;
      } else {
        failedCount++;
        errors.push(`${rec.name || phone}: ${result.error || 'Bilinmeyen hata'}`);
      }

      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    res.json({
      success: sentCount > 0,
      sentCount,
      failedCount,
      total: recipients.length,
      errors: errors.slice(0, 10),
      message: `${sentCount} kişiye WhatsApp mesajı başarıyla gönderildi.${failedCount > 0 ? ` (${failedCount} başarısız)` : ''}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Logs
router.get('/logs', authMiddleware, canManageWhatsApp, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await waha.getLogs(limit, pool);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
