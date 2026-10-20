const pool = require('../config/db');

/**
 * WAHA (WhatsApp HTTP API) Client & Service
 * Reference: https://waha.devlike.pro
 */

const DEFAULT_CONFIG = {
  apiUrl: process.env.WAHA_API_URL || 'https://waha.aifgenclik.at',
  apiKey: process.env.WAHA_API_KEY || 'Erbakan1926FilistineOzgurluk',
  session: process.env.WAHA_SESSION || 'micore',
  countryCode: process.env.WAHA_COUNTRY_CODE || '90',
  enabled: process.env.WAHA_ENABLED === 'false' ? false : true,
};

async function getWahaConfig(customPool) {
  const db = customPool || pool;
  try {
    const res = await db.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'whatsapp' LIMIT 1"
    );
    if (res.rows.length > 0 && res.rows[0].setting_value) {
      const val = res.rows[0].setting_value;
      return {
        apiUrl: (val.apiUrl || DEFAULT_CONFIG.apiUrl || '').trim().replace(/\/+$/, ''),
        apiKey: (val.apiKey || DEFAULT_CONFIG.apiKey || '').trim(),
        session: (val.session || DEFAULT_CONFIG.session || 'default').trim(),
        countryCode: (val.countryCode || DEFAULT_CONFIG.countryCode || '90').trim(),
        enabled: val.enabled !== undefined ? Boolean(val.enabled) : DEFAULT_CONFIG.enabled,
      };
    }
  } catch (err) {
    // If table doesn't exist yet or query fails, fall back to defaults
  }
  return { ...DEFAULT_CONFIG };
}

function formatChatId(phone, countryCode = '90') {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (!cleaned) return null;

  const cc = String(countryCode || '90').replace(/[^0-9]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = cc + cleaned.substring(1);
  } else if (cleaned.length <= 10 && !cleaned.startsWith(cc)) {
    cleaned = cc + cleaned;
  }

  return `${cleaned}@c.us`;
}

async function requestWaha(endpoint, data = {}, method = 'POST', customPool) {
  const config = await getWahaConfig(customPool);
  if (!config.apiUrl) {
    return { success: false, error: 'WAHA API URL tanımlanmamış.' };
  }

  let url = `${config.apiUrl}/${endpoint.replace(/^\/+/, '')}`;
  const sessionParam = `session=${encodeURIComponent(config.session)}`;
  if (!url.includes('?session=') && !url.includes('&session=')) {
    url += (url.includes('?') ? '&' : '?') + sessionParam;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (config.apiKey) {
    headers['X-Api-Key'] = config.apiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal,
    };

    if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT') {
      fetchOptions.body = JSON.stringify(data);
    }

    const res = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (res.ok) {
      return { success: true, data: json, code: res.status };
    }

    const errMsg = (json && (json.message || json.error)) || `HTTP ${res.status}: ${text.slice(0, 150)}`;
    return { success: false, error: errMsg, code: res.status, data: json };
  } catch (err) {
    clearTimeout(timeoutId);
    return { success: false, error: err.name === 'AbortError' ? 'Zaman aşımı (timeout)' : err.message };
  }
}

async function logMessage(payload, customPool) {
  const db = customPool || pool;
  const {
    phone,
    recipientName = null,
    messageType = 'text',
    content = '',
    status = 'success',
    errorMessage = null,
  } = payload;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        recipient_name VARCHAR(150),
        message_type VARCHAR(50) DEFAULT 'text',
        content TEXT,
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(
      `INSERT INTO whatsapp_logs (phone, recipient_name, message_type, content, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phone, recipientName, messageType, content, status, errorMessage]
    );
  } catch (e) {
    console.error('WhatsApp log kaydedilemedi:', e.message);
  }
}

async function sendText({ phone, message, recipientName = null, customPool }) {
  const config = await getWahaConfig(customPool);
  if (!config.enabled) {
    return { success: false, error: 'WhatsApp (WAHA) entegrasyonu aktif değil.' };
  }

  const chatId = formatChatId(phone, config.countryCode);
  if (!chatId) {
    return { success: false, error: 'Geçersiz telefon numarası.' };
  }

  const res = await requestWaha('api/sendText', {
    chatId,
    text: message,
    session: config.session,
    linkPreview: false,
  }, 'POST', customPool);

  const isSuccess = Boolean(res.success);
  await logMessage({
    phone,
    recipientName,
    messageType: 'text',
    content: message,
    status: isSuccess ? 'success' : 'failed',
    errorMessage: isSuccess ? null : (res.error || 'Gönderim hatası'),
  }, customPool);

  return res;
}

async function sendFile({ phone, fileUrl, filename, caption = '', recipientName = null, customPool }) {
  const config = await getWahaConfig(customPool);
  if (!config.enabled) {
    return { success: false, error: 'WhatsApp (WAHA) entegrasyonu aktif değil.' };
  }

  const chatId = formatChatId(phone, config.countryCode);
  if (!chatId) {
    return { success: false, error: 'Geçersiz telefon numarası.' };
  }

  const filePayload = { filename: filename || 'dosya' };
  if (fileUrl.startsWith('data:')) {
    const parts = fileUrl.split(',');
    const mimePart = (parts[0].split(';')[0] || '').replace('data:', '');
    filePayload.mimetype = mimePart;
    filePayload.data = parts[1] || '';
  } else {
    filePayload.url = fileUrl;
  }

  const res = await requestWaha('api/sendFile', {
    chatId,
    file: filePayload,
    caption,
    session: config.session,
  }, 'POST', customPool);

  const isSuccess = Boolean(res.success);
  await logMessage({
    phone,
    recipientName,
    messageType: 'file',
    content: `Dosya: ${filename} | Başlık: ${caption}`,
    status: isSuccess ? 'success' : 'failed',
    errorMessage: isSuccess ? null : (res.error || 'Dosya gönderim hatası'),
  }, customPool);

  return res;
}

async function checkStatus(customPool) {
  const config = await getWahaConfig(customPool);
  const sessionName = config.session || 'default';

  if (!config.apiUrl) {
    return {
      connected: false,
      status: 'NOT_CONFIGURED',
      message: 'WAHA API URL tanımlanmamış. Lütfen aşağıdaki ayarlardan sunucu adresini girin.',
      session: sessionName,
      apiUrl: '',
    };
  }

  const res = await requestWaha(`api/sessions/${encodeURIComponent(sessionName)}`, {}, 'GET', customPool);

  if (!res.success) {
    const code = res.code || 0;
    const errMsg = String(res.error || '').toLowerCase();
    if (code === 401 || errMsg.includes('unauthorized') || errMsg.includes('api key')) {
      return {
        connected: false,
        status: 'UNAUTHORIZED',
        code: 401,
        message: 'Yetkilendirme hatası (Unauthorized): WAHA API Key girilmemiş veya geçersiz.',
        session: sessionName,
        apiUrl: config.apiUrl,
      };
    }
    if (code === 404 || errMsg.includes('not found')) {
      // Session does not exist yet, attempt to start it
      await requestWaha('api/sessions/start', { name: sessionName }, 'POST', customPool);
      return {
        connected: false,
        status: 'SCAN_QR_CODE',
        message: 'Oturum oluşturuluyor, QR kod bekleniyor.',
        session: sessionName,
        apiUrl: config.apiUrl,
      };
    }
    return {
      connected: false,
      status: 'ERROR',
      code,
      message: res.error || 'WAHA sunucusuna ulaşılamıyor.',
      session: sessionName,
      apiUrl: config.apiUrl,
    };
  }

  const sessionData = res.data || {};
  const sessionStatus = sessionData.status || 'UNKNOWN';

  if (['STOPPED', 'STARTING'].includes(sessionStatus)) {
    await requestWaha('api/sessions/start', { name: sessionName }, 'POST', customPool);
    return {
      connected: false,
      status: 'SCAN_QR_CODE',
      message: 'Oturum başlatılıyor, QR bekleniyor...',
      session: sessionName,
      apiUrl: config.apiUrl,
    };
  }

  const isConnected = ['WORKING', 'CONNECTED'].includes(sessionStatus);
  return {
    connected: isConnected,
    status: sessionStatus,
    me: sessionData.me || null,
    message: isConnected ? 'WhatsApp bağlantısı aktif.' : `Durum: ${sessionStatus}`,
    session: sessionName,
    apiUrl: config.apiUrl,
  };
}

async function startSession(customPool) {
  const config = await getWahaConfig(customPool);
  const sessionName = config.session || 'default';

  let start = await requestWaha('api/sessions/start', {
    name: sessionName,
    config: {},
  }, 'POST', customPool);

  if (!start.success) {
    start = await requestWaha(`api/sessions/${encodeURIComponent(sessionName)}/start`, {}, 'POST', customPool);
  }

  const status = await checkStatus(customPool);
  return { ...status, startResult: start };
}

async function getLogs(limit = 50, customPool) {
  const db = customPool || pool;
  try {
    const res = await db.query(
      `SELECT * FROM whatsapp_logs ORDER BY id DESC LIMIT $1`,
      [Number(limit) || 50]
    );
    return res.rows;
  } catch {
    return [];
  }
}

module.exports = {
  getWahaConfig,
  formatChatId,
  requestWaha,
  sendText,
  sendFile,
  checkStatus,
  startSession,
  getLogs,
  logMessage,
};
