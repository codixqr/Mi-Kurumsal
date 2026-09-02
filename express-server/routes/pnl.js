const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, requireAdmin, requirePermission } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
// Add other common imports here if they are missing

router.use("/", authMiddleware, requirePermission("pnl"));

// =====================================================
// PnL - Gelirler (Revenues) CRUD
// =====================================================

// =====================================================
// PnL - Giderler (Expenses) CRUD
// =====================================================

// =====================================================
// PnL - Personel Giderleri CRUD
// =====================================================

// =====================================================
// PnL - Özet & Aylık Rapor
// =====================================================

// =====================================================
// PnL - Başlık Eşleştirme (Field Mappings)
// =====================================================
router.get("/revenues", authMiddleware, async (req, res) => {
  const {
    month,
    year,
    branch
  } = req.query;
  let query = "SELECT * FROM pnl_revenues WHERE 1=1";
  const params = [];
  if (month) {
    params.push(month);
    query += ` AND month_name=$${params.length}`;
  }
  if (year) {
    params.push(Number(year));
    query += ` AND year_value=$${params.length}`;
  }
  if (branch && branch !== 'all') {
    params.push(branch);
    query += ` AND branch=$${params.length}`;
  }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

router.post("/revenues", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch = 'Genel',
    revenueType = 'Satış',
    description = null,
    amount,
    source = 'Manuel',
    monthName,
    yearValue
  } = req.body || {};
  const inserted = await pool.query(`INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [entryDate, branch, revenueType, description, Number(amount || 0), source, monthName, Number(yearValue), req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.put("/revenues/:id", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch,
    revenueType,
    description,
    amount,
    monthName,
    yearValue
  } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_revenues WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın."
    });
  }
  const updated = await pool.query(`UPDATE pnl_revenues SET entry_date=$1,branch=$2,revenue_type=$3,description=$4,amount=$5,month_name=$6,year_value=$7
     WHERE id=$8 RETURNING *`, [entryDate, branch, revenueType, description, Number(amount || 0), monthName, Number(yearValue), req.params.id]);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  res.json(updated.rows[0]);
});

router.delete("/revenues/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_revenues WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. Önce kopyalayın."
    });
  }
  await pool.query("DELETE FROM pnl_revenues WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Giderler (Expenses) CRUD
// =====================================================

// =====================================================
// PnL - Giderler (Expenses) CRUD
// =====================================================
router.get("/expenses", authMiddleware, async (req, res) => {
  const {
    month,
    year,
    branch
  } = req.query;
  let query = "SELECT * FROM pnl_expenses WHERE 1=1";
  const params = [];
  if (month) {
    params.push(month);
    query += ` AND month_name=$${params.length}`;
  }
  if (year) {
    params.push(Number(year));
    query += ` AND year_value=$${params.length}`;
  }
  if (branch && branch !== 'all') {
    params.push(branch);
    query += ` AND branch=$${params.length}`;
  }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

router.post("/expenses", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch = 'Genel',
    category = 'Diğer',
    subCategory = null,
    description = null,
    amount,
    source = 'Manuel',
    monthName,
    yearValue
  } = req.body || {};
  const inserted = await pool.query(`INSERT INTO pnl_expenses(entry_date,branch,category,sub_category,description,amount,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [entryDate, branch, category, subCategory, description, Number(amount || 0), source, monthName, Number(yearValue), req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.put("/expenses/:id", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch,
    category,
    subCategory,
    description,
    amount,
    monthName,
    yearValue
  } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_expenses WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın."
    });
  }
  const updated = await pool.query(`UPDATE pnl_expenses SET entry_date=$1,branch=$2,category=$3,sub_category=$4,description=$5,amount=$6,month_name=$7,year_value=$8
     WHERE id=$9 RETURNING *`, [entryDate, branch, category, subCategory, description, Number(amount || 0), monthName, Number(yearValue), req.params.id]);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  res.json(updated.rows[0]);
});

router.delete("/expenses/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_expenses WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. Önce kopyalayın."
    });
  }
  await pool.query("DELETE FROM pnl_expenses WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Personel Giderleri CRUD
// =====================================================

// =====================================================
// PnL - Personel Giderleri CRUD
// =====================================================
router.get("/personnel", authMiddleware, async (req, res) => {
  const {
    month,
    year,
    branch
  } = req.query;
  let query = "SELECT * FROM pnl_personnel WHERE 1=1";
  const params = [];
  if (month) {
    params.push(month);
    query += ` AND month_name=$${params.length}`;
  }
  if (year) {
    params.push(Number(year));
    query += ` AND year_value=$${params.length}`;
  }
  if (branch && branch !== 'all') {
    params.push(branch);
    query += ` AND branch=$${params.length}`;
  }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

router.post("/personnel", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch = 'Genel',
    personName,
    position = null,
    salary = 0,
    bonus = 0,
    deduction = 0,
    source = 'Manuel',
    monthName,
    yearValue
  } = req.body || {};
  const totalCost = Number(salary) + Number(bonus) - Number(deduction);
  const inserted = await pool.query(`INSERT INTO pnl_personnel(entry_date,branch,person_name,position,salary,bonus,deduction,total_cost,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [entryDate, branch, personName, position, Number(salary), Number(bonus), Number(deduction), totalCost, source, monthName, Number(yearValue), req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.put("/personnel/:id", authMiddleware, async (req, res) => {
  const {
    entryDate,
    branch,
    personName,
    position,
    salary = 0,
    bonus = 0,
    deduction = 0,
    monthName,
    yearValue
  } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_personnel WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın."
    });
  }
  const totalCost = Number(salary) + Number(bonus) - Number(deduction);
  const updated = await pool.query(`UPDATE pnl_personnel SET entry_date=$1,branch=$2,person_name=$3,position=$4,salary=$5,bonus=$6,deduction=$7,total_cost=$8,month_name=$9,year_value=$10
     WHERE id=$11 RETURNING *`, [entryDate, branch, personName, position, Number(salary), Number(bonus), Number(deduction), totalCost, monthName, Number(yearValue), req.params.id]);
  if (updated.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  res.json(updated.rows[0]);
});

router.delete("/personnel/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_personnel WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({
    message: "Kayıt bulunamadı."
  });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({
      message: "Excel kayıtları kilitlidir. Önce kopyalayın."
    });
  }
  await pool.query("DELETE FROM pnl_personnel WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Özet & Aylık Rapor
// =====================================================

// =====================================================
// PnL - Özet & Aylık Rapor
// =====================================================
router.get("/summary", authMiddleware, async (req, res) => {
  const {
    month,
    year,
    branch
  } = req.query;
  const buildWhere = prefix => {
    const conds = [];
    const params = [];
    if (month) {
      params.push(month);
      conds.push(`month_name=$${params.length}`);
    }
    if (year) {
      params.push(Number(year));
      conds.push(`year_value=$${params.length}`);
    }
    if (branch && branch !== 'all') {
      params.push(branch);
      conds.push(`branch=$${params.length}`);
    }
    return {
      where: conds.length ? ' WHERE ' + conds.join(' AND ') : '',
      params
    };
  };
  const {
    where,
    params
  } = buildWhere();
  const [revRes, expRes, perRes, catRes] = await Promise.all([pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM pnl_revenues${where}`, params), pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM pnl_expenses${where}`, params), pool.query(`SELECT COALESCE(SUM(total_cost),0) AS total FROM pnl_personnel${where}`, params), pool.query(`SELECT category, COALESCE(SUM(amount),0) AS total FROM pnl_expenses${where} GROUP BY category ORDER BY total DESC`, params)]);
  const totalRevenue = Number(revRes.rows[0].total);
  const totalExpensesOnly = Number(expRes.rows[0].total);
  const totalPersonnel = Number(perRes.rows[0].total);
  const totalExpense = totalExpensesOnly + totalPersonnel;
  const netProfit = totalRevenue - totalExpense;
  const profitMargin = totalRevenue > 0 ? netProfit / totalRevenue * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? totalExpense / totalRevenue * 100 : 0;
  const personnelRatio = totalRevenue > 0 ? totalPersonnel / totalRevenue * 100 : 0;
  const foodExpense = catRes.rows.find(r => r.category === 'Gıda')?.total || 0;
  const foodRatio = totalRevenue > 0 ? Number(foodExpense) / totalRevenue * 100 : 0;
  res.json({
    totalRevenue,
    totalExpense,
    totalPersonnel,
    netProfit,
    profitMargin: +profitMargin.toFixed(2),
    expenseRatio: +expenseRatio.toFixed(2),
    personnelRatio: +personnelRatio.toFixed(2),
    foodRatio: +foodRatio.toFixed(2),
    expenseByCategory: catRes.rows.map(r => ({
      category: r.category,
      total: Number(r.total)
    }))
  });
});

router.get("/monthly-summaries", authMiddleware, async (req, res) => {
  const monthOrder = `CASE month_name WHEN 'OCAK' THEN 1 WHEN 'ŞUBAT' THEN 2 WHEN 'MART' THEN 3 WHEN 'NİSAN' THEN 4 WHEN 'MAYIS' THEN 5 WHEN 'HAZİRAN' THEN 6 WHEN 'TEMMUZ' THEN 7 WHEN 'AĞUSTOS' THEN 8 WHEN 'EYLÜL' THEN 9 WHEN 'EKİM' THEN 10 WHEN 'KASIM' THEN 11 WHEN 'ARALIK' THEN 12 ELSE 99 END`;
  const months = await pool.query(`
    SELECT DISTINCT month_name, year_value FROM (
      SELECT month_name, year_value FROM pnl_revenues
      UNION SELECT month_name, year_value FROM pnl_expenses
      UNION SELECT month_name, year_value FROM pnl_personnel
    ) t ORDER BY year_value DESC, ${monthOrder} DESC
  `);
  const result = [];
  for (const m of months.rows) {
    const [r, e, p] = await Promise.all([pool.query('SELECT COALESCE(SUM(amount),0) AS t FROM pnl_revenues WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value]), pool.query('SELECT COALESCE(SUM(amount),0) AS t FROM pnl_expenses WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value]), pool.query('SELECT COALESCE(SUM(total_cost),0) AS t FROM pnl_personnel WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value])]);
    const rev = Number(r.rows[0].t);
    const exp = Number(e.rows[0].t) + Number(p.rows[0].t);
    const net = rev - exp;
    result.push({
      monthName: m.month_name,
      yearValue: m.year_value,
      revenue: rev,
      expense: exp,
      netProfit: net,
      profitMargin: rev > 0 ? +(net / rev * 100).toFixed(2) : 0
    });
  }
  res.json(result);
});

// =====================================================
// PnL - Başlık Eşleştirme (Field Mappings)
// =====================================================

// =====================================================
// PnL - Başlık Eşleştirme (Field Mappings)
// =====================================================
router.get("/mappings", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM pnl_field_mappings ORDER BY source_header ASC");
  res.json(rows.rows);
});

router.post("/mappings", authMiddleware, async (req, res) => {
  const {
    sourceHeader,
    mappedCategory,
    mappedType = 'expense'
  } = req.body || {};
  const upserted = await pool.query(`INSERT INTO pnl_field_mappings(source_header,mapped_category,mapped_type)
     VALUES($1,$2,$3)
     ON CONFLICT(source_header) DO UPDATE SET mapped_category=EXCLUDED.mapped_category, mapped_type=EXCLUDED.mapped_type
     RETURNING *`, [String(sourceHeader).trim(), mappedCategory, mappedType]);
  res.status(201).json(upserted.rows[0]);
});

// =====================================================
// PnL - Excel İçe Aktarma (Preview + Confirm)
// =====================================================

router.post("/import-preview", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({
    message: "Dosya yüklenmedi."
  });
  const workbook = xlsx.readFile(req.file.path);
  const savedMappings = (await pool.query("SELECT * FROM pnl_field_mappings")).rows;
  const sheetResults = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: ""
    });
    const monthName = normalizeMonthName(sheetName);
    const recognized = [];
    const unmapped = [];
    for (const row of rawRows) {
      if (!Array.isArray(row)) continue;
      const label = String(row[1] || row[0] || "").trim();
      if (!label) continue;
      const amount = pickNumeric(row[2] ?? row[1]);
      if (amount === null || amount === 0) continue;
      const mapping = resolveMapping(label, savedMappings);
      if (mapping) {
        recognized.push({
          label,
          amount,
          category: mapping.category,
          type: mapping.type,
          monthName
        });
      } else {
        unmapped.push({
          label,
          amount,
          monthName,
          suggestedCategory: "Diğer"
        });
      }
    }
    if (recognized.length > 0 || unmapped.length > 0) {
      sheetResults.push({
        sheetName,
        monthName,
        recognized,
        unmapped
      });
    }
  }
  res.json({
    sheetResults,
    fileName: req.file.originalname
  });
});

router.post("/import-confirm", authMiddleware, async (req, res) => {
  const {
    rows,
    year = new Date().getFullYear(),
    branch = 'Genel',
    mappingsToSave = []
  } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({
      message: "İçe aktarılacak satır bulunamadı."
    });
  }

  // Save new mappings
  for (const m of mappingsToSave) {
    if (!m?.label || !m?.category || m.category === "Atla") continue;
    await pool.query(`INSERT INTO pnl_field_mappings(source_header,mapped_category,mapped_type)
       VALUES($1,$2,$3)
       ON CONFLICT(source_header) DO UPDATE SET mapped_category=EXCLUDED.mapped_category, mapped_type=EXCLUDED.mapped_type`, [m.label, m.category, m.type || 'expense']).catch(() => {});
  }
  let importedCount = 0;
  const today = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    const entryDate = row.entryDate || today;
    const monthName = row.monthName || 'BİLİNMEYEN';
    const amount = Number(row.amount || 0);
    if (row.category === "Atla") continue;
    if (amount <= 0) continue;
    if (row.type === 'revenue') {
      await pool.query(`INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
         VALUES($1,$2,$3,$4,$5,'Excel',$6,$7,$8)`, [entryDate, branch, row.category || 'Satış', row.label, amount, monthName, Number(year), req.user.id]);
    } else {
      await pool.query(`INSERT INTO pnl_expenses(entry_date,branch,category,description,amount,source,month_name,year_value,created_by)
         VALUES($1,$2,$3,$4,$5,'Excel',$6,$7,$8)`, [entryDate, branch, row.category || 'Diğer', row.label, amount, monthName, Number(year), req.user.id]);
    }
    importedCount++;
  }
  res.json({
    message: `${importedCount} kayıt başarıyla içe aktarıldı.`,
    importedCount
  });
});

// =====================================================
// PnL - Legacy (eski özet listesi, geriye dönük uyum)
// =====================================================

// =====================================================
// PnL - Legacy (eski özet listesi, geriye dönük uyum)
// =====================================================
router.get("/", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM pnl_reports ORDER BY year_value DESC, id DESC");
  res.json(rows.rows);
});

router.get("/:id/details", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM pnl_detail_lines WHERE pnl_report_id=$1 ORDER BY id ASC", [req.params.id]);
  res.json(rows.rows);
});

router.post("/", authMiddleware, async (req, res) => {
  const {
    monthName,
    yearValue,
    revenue,
    expense,
    profit,
    note = null,
    sourceFile = null
  } = req.body || {};
  const inserted = await pool.query(`INSERT INTO pnl_reports(month_name,year_value,revenue,expense,profit,note,source_file,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [monthName, Number(yearValue), Number(revenue || 0), Number(expense || 0), Number(profit || 0), note, sourceFile, req.user.id]);
  res.status(201).json(inserted.rows[0]);
});

router.put("/:id", authMiddleware, async (req, res) => {
  const {
    monthName,
    yearValue,
    revenue,
    expense,
    profit,
    note = null
  } = req.body || {};
  const updated = await pool.query(`UPDATE pnl_reports
     SET month_name=$1,year_value=$2,revenue=$3,expense=$4,profit=$5,note=$6,updated_at=NOW()
     WHERE id=$7 RETURNING *`, [monthName, Number(yearValue), Number(revenue || 0), Number(expense || 0), Number(profit || 0), note, req.params.id]);
  if (updated.rowCount === 0) {
    return res.status(404).json({
      message: "Kayıt bulunamadı."
    });
  }
  res.json(updated.rows[0]);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM pnl_reports WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

router.post("/import", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {
  const fallbackPath = "c:/Users/Xezal/Desktop/Kar Zarar Raporu mi kurumsal.xlsx";
  const filePath = req.file ? req.file.path : fallbackPath;
  const workbook = xlsx.readFile(filePath);
  const targetSheets = ["AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];
  const imported = [];
  for (const month of targetSheets) {
    const sheetName = workbook.SheetNames.find(n => normalizeMonthName(n) === normalizeMonthName(month));
    if (!sheetName) continue;
    const row = extractMonthlyPnL(workbook.Sheets[sheetName], month);
    const upsert = await pool.query(`INSERT INTO pnl_reports(month_name,year_value,revenue,expense,profit,note,source_file,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`, [month, 2023, row.revenue, row.expense, row.profit, "Excel içe aktarım", req.file?.originalname || "Yerel dosya", req.user.id]);
    const insertedReport = upsert.rows[0];
    const detailLines = extractPnLDetailLines(workbook.Sheets[sheetName]);
    for (const d of detailLines) {
      await pool.query(`INSERT INTO pnl_detail_lines(pnl_report_id,category,item_name,amount,ratio,source_file)
         VALUES($1,$2,$3,$4,$5,$6)`, [insertedReport.id, d.category, d.itemName, d.amount, d.ratio, req.file?.originalname || "Yerel dosya"]);
    }
    imported.push({
      ...insertedReport,
      detailCount: detailLines.length
    });
  }
  if (req.file) {
    const stored = req.file.key || req.file.filename;
    const fUrl = isR2Enabled && req.file.key ? `${process.env.R2_PUBLIC_URL || ""}/${req.file.key}` : `/uploads/${req.file.filename}`;
    await pool.query(`INSERT INTO uploaded_files(module_name,original_name,stored_name,file_url,mime_type,size_bytes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`, ["pnl", req.file.originalname, stored, fUrl, req.file.mimetype, req.file.size, req.user.id]);
  }
  res.json({
    importedCount: imported.length,
    imported
  });
});

// Excel Şablon İndir

// Aylık Özet

// Excel İçe Aktar — parse + preview

// Excel İçe Aktar — confirm (insert)

// Gelirler CRUD

// Giderler CRUD

// Özet

// PDF Export (branded)

// Excel Export
router.get("/customer/excel-template", authMiddleware, async (req, res, next) => {
  try {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const gelirData = [['Tarih', 'Ay', 'Yıl', 'Kategori', 'Açıklama', 'Tutar'], ['2026-01-01', 'Ocak', '2026', 'Ciro', 'Ocak ayı satış geliri', 150000], ['2026-01-15', 'Ocak', '2026', 'Komisyon Geliri', 'Franchise komisyon bedeli', 22000], ['2026-02-01', 'Şubat', '2026', 'Ciro', 'Şubat satış geliri', 162000], ['2026-02-10', 'Şubat', '2026', 'Danışmanlık Geliri', 'Ek danışmanlık hizmeti', 12000]];
    const wsGelir = XLSX.utils.aoa_to_sheet(gelirData);
    wsGelir['!cols'] = [{
      wch: 12
    }, {
      wch: 10
    }, {
      wch: 6
    }, {
      wch: 18
    }, {
      wch: 30
    }, {
      wch: 14
    }];
    XLSX.utils.book_append_sheet(wb, wsGelir, 'Gelirler');
    const giderData = [['Tarih', 'Ay', 'Yıl', 'Kategori', 'Alt Kategori', 'Açıklama', 'Tutar'], ['2026-01-02', 'Ocak', '2026', 'Personel', '', 'Ocak personel maaşları', 55000], ['2026-01-03', 'Ocak', '2026', 'Kira', '', 'Mağaza kirası', 28000], ['2026-01-05', 'Ocak', '2026', 'Gıda', 'Hammadde', 'Ocak malzeme alımı', 34000], ['2026-01-10', 'Ocak', '2026', 'Elektrik', '', 'Elektrik faturası', 4200], ['2026-02-02', 'Şubat', '2026', 'Personel', '', 'Şubat personel maaşları', 55000], ['2026-02-03', 'Şubat', '2026', 'Kira', '', 'Mağaza kirası', 28000]];
    const wsGider = XLSX.utils.aoa_to_sheet(giderData);
    wsGider['!cols'] = [{
      wch: 12
    }, {
      wch: 10
    }, {
      wch: 6
    }, {
      wch: 14
    }, {
      wch: 14
    }, {
      wch: 26
    }, {
      wch: 14
    }];
    XLSX.utils.book_append_sheet(wb, wsGider, 'Giderler');
    const buf = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx'
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="musteri-pnl-sablon.xlsx"');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

// Aylık Özet
router.get("/customer/:investorId/monthly-summary", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      year
    } = req.query;
    const y = year || new Date().getFullYear();
    const [revRows, expRows] = await Promise.all([pool.query(`SELECT month_name, COALESCE(SUM(amount),0)::numeric AS total FROM customer_pnl_revenues WHERE investor_id=$1 AND year_value=$2 GROUP BY month_name`, [investorId, y]), pool.query(`SELECT month_name, COALESCE(SUM(amount),0)::numeric AS total FROM customer_pnl_expenses WHERE investor_id=$1 AND year_value=$2 GROUP BY month_name`, [investorId, y])]);
    const revMap = {};
    revRows.rows.forEach(r => revMap[r.month_name] = Number(r.total));
    const expMap = {};
    expRows.rows.forEach(r => expMap[r.month_name] = Number(r.total));
    const summary = MONTHS_TR.map(m => ({
      month: m,
      revenue: revMap[m] || 0,
      expense: expMap[m] || 0,
      net: (revMap[m] || 0) - (expMap[m] || 0)
    }));
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

// Excel İçe Aktar — parse + preview

// Excel İçe Aktar — parse + preview
router.post("/customer/:investorId/import-excel", authMiddleware, uploadLocal.single('file'), async (req, res, next) => {
  try {
    const XLSX = require("xlsx");
    if (!req.file) return res.status(400).json({
      message: 'Dosya gerekli'
    });
    const wb = XLSX.readFile(req.file.path);
    const result = {
      revenues: [],
      expenses: []
    };
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, {
        defval: ''
      });
      const isRevSheet = /gelir|revenue|ciro|satış/i.test(sheetName);
      const isExpSheet = /gider|expense|maliyet|masraf/i.test(sheetName);
      for (const row of rows) {
        const get = (...names) => {
          for (const n of names) {
            const k = Object.keys(row).find(k => k.trim().toLowerCase().includes(n.toLowerCase()));
            if (k) return String(row[k] || '').trim();
          }
          return '';
        };
        const rawAmt = get('tutar', 'amount', 'gelir', 'gider', 'para', 'fiyat');
        const tutar = parseFloat(String(rawAmt).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
        if (!tutar) continue;
        const tip = get('tip', 'type', 'tür', 'tur');
        const isRevRow = /gelir|satış|ciro|komisyon|revenue/i.test(tip);
        const isExpRow = /gider|masraf|expense|maliyet/i.test(tip);
        const entry = {
          entryDate: get('tarih', 'date') || new Date().toISOString().split('T')[0],
          monthName: get('ay', 'month') || MONTHS_TR[new Date().getMonth()],
          yearValue: parseInt(get('yıl', 'yil', 'year')) || new Date().getFullYear(),
          category: get('kategori', 'category') || '',
          subCategory: get('alt kategori', 'sub', 'subcategory') || '',
          description: get('açıklama', 'aciklama', 'description', 'not', 'note') || '',
          amount: tutar
        };
        const isRev = isRevSheet || isRevRow || !isExpSheet && !isExpRow && !tip;
        if (isExpSheet || isExpRow) result.expenses.push(entry);else result.revenues.push(entry);
      }
    }
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    res.json({
      revenues: result.revenues.slice(0, 200),
      expenses: result.expenses.slice(0, 200),
      totalRevenues: result.revenues.length,
      totalExpenses: result.expenses.length
    });
  } catch (e) {
    next(e);
  }
});

// Excel İçe Aktar — confirm (insert)

// Excel İçe Aktar — confirm (insert)
router.post("/customer/:investorId/confirm-import", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      revenues = [],
      expenses = []
    } = req.body;
    let ir = 0,
      ie = 0;
    for (const r of revenues) {
      await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [investorId, r.entryDate || new Date().toISOString().split('T')[0], r.monthName || MONTHS_TR[0], r.yearValue || 2026, r.category || 'Ciro', r.description || '', Number(r.amount || 0), req.user.id]);
      ir++;
    }
    for (const r of expenses) {
      await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,sub_category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [investorId, r.entryDate || new Date().toISOString().split('T')[0], r.monthName || MONTHS_TR[0], r.yearValue || 2026, r.category || 'Gıda', r.subCategory || '', r.description || '', Number(r.amount || 0), req.user.id]);
      ie++;
    }
    res.json({
      insertedRevenues: ir,
      insertedExpenses: ie,
      total: ir + ie
    });
  } catch (e) {
    next(e);
  }
});

// Gelirler CRUD

// Gelirler CRUD
router.get("/customer/:investorId/revenues", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      month,
      year
    } = req.query;
    let q = `SELECT * FROM customer_pnl_revenues WHERE investor_id=$1`;
    const params = [investorId];
    if (month) {
      params.push(month);
      q += ` AND month_name=$${params.length}`;
    }
    if (year) {
      params.push(year);
      q += ` AND year_value=$${params.length}`;
    }
    q += ` ORDER BY entry_date DESC`;
    const {
      rows
    } = await pool.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/customer/:investorId/revenues", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      entryDate,
      monthName,
      yearValue,
      category,
      description,
      amount,
      note
    } = req.body;
    const {
      rows
    } = await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,note,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [investorId, entryDate, monthName, yearValue, category || 'Ciro', description || '', Number(amount || 0), note || '', req.user.id]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put("/customer/:investorId/revenues/:id", authMiddleware, async (req, res, next) => {
  try {
    const {
      id
    } = req.params;
    const {
      entryDate,
      monthName,
      yearValue,
      category,
      description,
      amount,
      note
    } = req.body;
    const {
      rows
    } = await pool.query(`UPDATE customer_pnl_revenues SET entry_date=$1,month_name=$2,year_value=$3,category=$4,description=$5,amount=$6,note=$7 WHERE id=$8 RETURNING *`, [entryDate, monthName, yearValue, category || 'Ciro', description || '', Number(amount || 0), note || '', id]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete("/customer/:investorId/revenues/:id", authMiddleware, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM customer_pnl_revenues WHERE id=$1`, [req.params.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Giderler CRUD

// Giderler CRUD
router.get("/customer/:investorId/expenses", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      month,
      year
    } = req.query;
    let q = `SELECT * FROM customer_pnl_expenses WHERE investor_id=$1`;
    const params = [investorId];
    if (month) {
      params.push(month);
      q += ` AND month_name=$${params.length}`;
    }
    if (year) {
      params.push(year);
      q += ` AND year_value=$${params.length}`;
    }
    q += ` ORDER BY entry_date DESC`;
    const {
      rows
    } = await pool.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/customer/:investorId/expenses", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      entryDate,
      monthName,
      yearValue,
      category,
      subCategory,
      description,
      amount,
      note
    } = req.body;
    const {
      rows
    } = await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,sub_category,description,amount,note,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [investorId, entryDate, monthName, yearValue, category || 'Gıda', subCategory || '', description || '', Number(amount || 0), note || '', req.user.id]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put("/customer/:investorId/expenses/:id", authMiddleware, async (req, res, next) => {
  try {
    const {
      id
    } = req.params;
    const {
      entryDate,
      monthName,
      yearValue,
      category,
      subCategory,
      description,
      amount,
      note
    } = req.body;
    const {
      rows
    } = await pool.query(`UPDATE customer_pnl_expenses SET entry_date=$1,month_name=$2,year_value=$3,category=$4,sub_category=$5,description=$6,amount=$7,note=$8 WHERE id=$9 RETURNING *`, [entryDate, monthName, yearValue, category || 'Gıda', subCategory || '', description || '', Number(amount || 0), note || '', id]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete("/customer/:investorId/expenses/:id", authMiddleware, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM customer_pnl_expenses WHERE id=$1`, [req.params.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Özet

// Özet
router.get("/customer/:investorId/summary", authMiddleware, async (req, res, next) => {
  try {
    const {
      investorId
    } = req.params;
    const {
      month,
      year
    } = req.query;
    let revQ = `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM customer_pnl_revenues WHERE investor_id=$1`;
    let expQ = `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM customer_pnl_expenses WHERE investor_id=$1`;
    const params = [investorId];
    if (month) {
      params.push(month);
      revQ += ` AND month_name=$${params.length}`;
      expQ += ` AND month_name=$${params.length}`;
    }
    if (year) {
      params.push(year);
      revQ += ` AND year_value=$${params.length}`;
      expQ += ` AND year_value=$${params.length}`;
    }
    const [rev, exp, inv] = await Promise.all([pool.query(revQ, params), pool.query(expQ, params), pool.query(`SELECT id,name,email,phone,sector,city FROM investors WHERE id=$1`, [investorId])]);
    const totalRevenue = Number(rev.rows[0].total || 0);
    const totalExpense = Number(exp.rows[0].total || 0);
    const netProfit = totalRevenue - totalExpense;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : '0.0';
    res.json({
      investor: inv.rows[0] || {},
      totalRevenue,
      totalExpense,
      netProfit,
      margin
    });
  } catch (e) {
    next(e);
  }
});

// PDF Export (branded)

// PDF Export (branded)
router.get("/customer/:investorId/export-pdf", authMiddleware, async (req, res, next) => {
  try {
    const PDFDocument = require("pdfkit");
    const {
      investorId
    } = req.params;
    const {
      month,
      year
    } = req.query;
    let revQ = `SELECT * FROM customer_pnl_revenues WHERE investor_id=$1 ORDER BY entry_date`;
    let expQ = `SELECT * FROM customer_pnl_expenses WHERE investor_id=$1 ORDER BY entry_date`;
    const params = [investorId];
    if (month) {
      params.push(month);
      revQ = revQ.replace('ORDER', `AND month_name=$${params.length} ORDER`);
      expQ = expQ.replace('ORDER', `AND month_name=$${params.length} ORDER`);
    }
    if (year) {
      params.push(year);
      revQ = revQ.replace('ORDER', `AND year_value=$${params.length} ORDER`);
      expQ = expQ.replace('ORDER', `AND year_value=$${params.length} ORDER`);
    }
    const [revRows, expRows, invRes] = await Promise.all([pool.query(revQ, params), pool.query(expQ, params), pool.query(`SELECT * FROM investors WHERE id=$1`, [investorId])]);
    const investor = invRes.rows[0] || {};
    const revenues = revRows.rows;
    const expenses = expRows.rows;
    const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExpense = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const netProfit = totalRevenue - totalExpense;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : '0.0';
    const fmtTL = n => Number(n || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: 2
    }) + ' ₺';
    const periodLabel = month && year ? `${month} ${year}` : year ? `${year} Yılı` : 'Tüm Dönem';
    const doc = new PDFDocument({
      size: 'A4',
      margin: 45,
      bufferPages: true
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="musteri-kar-zarar-${investorId}.pdf"`);
    doc.pipe(res);

    // Dynamic font registration
    try {
      const fontReg = await getRobotoRegular();
      const fontBold = await getRobotoBold();
      if (fontReg) doc.registerFont("Roboto", fontReg);
      if (fontBold) doc.registerFont("Roboto-Bold", fontBold);
    } catch (err) {
      console.error("PDF font loading failed, using default Helvetica:", err.message);
    }
    const hasRoboto = doc.font("Roboto-Bold").name === "Roboto-Bold";
    const fontRegular = hasRoboto ? "Roboto" : "Helvetica";
    const fontBold = hasRoboto ? "Roboto-Bold" : "Helvetica-Bold";
    const BRAND_GREEN = '#1a5c38';
    const BRAND_LIGHT = '#f0fdf4';
    const TEXT_DARK = '#1e293b';
    const TEXT_GRAY = '#64748b';
    const pageW = doc.page.width - 90;

    // ── Logo & Başlık ──────────────────────────────────────────────────
    const logoPath = path.join(__dirname, '..', 'public', 'logo', 'micore_logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 45, 38, {
        height: 42
      });
    }
    doc.fontSize(8).fillColor(TEXT_GRAY).font(fontRegular).text('Mi Kurumsal CRM', 45, 42, {
      align: 'right',
      width: pageW
    });
    doc.fontSize(7).fillColor(TEXT_GRAY).font(fontRegular).text('www.mikurumsal.com', 45, 53, {
      align: 'right',
      width: pageW
    });
    doc.moveTo(45, 88).lineTo(45 + pageW, 88).lineWidth(1.5).strokeColor(BRAND_GREEN).stroke();

    // ── Belge Başlığı ──────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor(BRAND_GREEN).font(fontBold).text('MÜŞTERİ KAR / ZARAR RAPORU', 45, 98, {
      width: pageW
    });
    doc.fontSize(10).fillColor(TEXT_GRAY).font(fontRegular).text(`Dönem: ${periodLabel}   |   Oluşturma Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 45, 120);

    // ── Müşteri Bilgileri ──────────────────────────────────────────────
    doc.roundedRect(45, 135, pageW, 54, 6).fill(BRAND_LIGHT);
    doc.fontSize(9).fillColor(TEXT_DARK).font(fontBold).text('MÜŞTERİ BİLGİLERİ', 55, 142);
    doc.font(fontRegular).fillColor(TEXT_GRAY).fontSize(8.5).text(`Ad Soyad: ${investor.name || '—'}`, 55, 155).text(`Sektör: ${investor.sector || '—'}  |  Şehir: ${investor.city || '—'}`, 55, 167).text(`Tel: ${investor.phone || '—'}  |  E-posta: ${investor.email || '—'}`, 55, 179);
    doc.y = 200;

    // ── KPI Kutuları ──────────────────────────────────────────────────
    const kpiBoxW = pageW / 3 - 6;
    const kpiY = doc.y + 5;
    const kpis = [{
      label: 'TOPLAM GELİR',
      value: fmtTL(totalRevenue),
      color: '#16a34a'
    }, {
      label: 'TOPLAM GİDER',
      value: fmtTL(totalExpense),
      color: '#dc2626'
    }, {
      label: 'NET KAR / ZARAR',
      value: fmtTL(netProfit),
      color: netProfit >= 0 ? '#16a34a' : '#dc2626'
    }];
    kpis.forEach((k, i) => {
      const x = 45 + i * (kpiBoxW + 9);
      doc.roundedRect(x, kpiY, kpiBoxW, 50, 5).fill('#fff').stroke('#e2e8f0');
      doc.fontSize(7).fillColor(TEXT_GRAY).font(fontRegular).text(k.label, x + 8, kpiY + 10);
      doc.fontSize(12).fillColor(k.color).font(fontBold).text(k.value, x + 8, kpiY + 24, {
        width: kpiBoxW - 16
      });
    });
    doc.y = kpiY + 60;

    // helper: table
    const drawTable = (headers, rows, y0) => {
      const colW = pageW / headers.length;
      doc.roundedRect(45, y0, pageW, 20, 3).fill(BRAND_GREEN);
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor('#fff').font(fontBold).text(h, 45 + i * colW + 6, y0 + 6, {
          width: colW - 8,
          align: i === headers.length - 1 ? 'right' : 'left'
        });
      });
      let rowY = y0 + 20;
      rows.forEach((row, ri) => {
        const rowH = 18;
        doc.rect(45, rowY, pageW, rowH).fill(ri % 2 === 0 ? '#f8fafc' : '#fff');
        row.forEach((cell, ci) => {
          doc.fontSize(8).fillColor(TEXT_DARK).font(fontRegular).text(String(cell || ''), 45 + ci * colW + 6, rowY + 5, {
            width: colW - 8,
            align: ci === row.length - 1 ? 'right' : 'left'
          });
        });
        rowY += rowH;
      });
      doc.rect(45, y0, pageW, rowY - y0).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
      return rowY + 8;
    };

    // ── Gelirler Tablosu ──────────────────────────────────────────────
    doc.fontSize(11).fillColor(BRAND_GREEN).font(fontBold).text('GELİRLER', 45, doc.y + 4);
    doc.y += 2;
    const revTableData = revenues.map(r => [r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '—', r.month_name || '—', r.category || '—', r.description || '—', fmtTL(r.amount)]);
    const afterRev = drawTable(['Tarih', 'Ay', 'Kategori', 'Açıklama', 'Tutar'], revTableData, doc.y + 2);
    if (revenues.length > 0) {
      doc.fontSize(8.5).fillColor('#16a34a').font(fontBold).text(`Toplam Gelir: ${fmtTL(totalRevenue)}`, 45, afterRev, {
        align: 'right',
        width: pageW
      });
    }
    doc.y = afterRev + 18;

    // Sayfa kontrolü
    if (doc.y > 680) {
      doc.addPage();
    }

    // ── Giderler Tablosu ──────────────────────────────────────────────
    doc.fontSize(11).fillColor('#dc2626').font(fontBold).text('GİDERLER', 45, doc.y + 4);
    doc.y += 2;
    const expTableData = expenses.map(r => [r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '—', r.month_name || '—', r.category || '—', r.description || '—', fmtTL(r.amount)]);
    const afterExp = drawTable(['Tarih', 'Ay', 'Kategori', 'Açıklama', 'Tutar'], expTableData, doc.y + 2);
    if (expenses.length > 0) {
      doc.fontSize(8.5).fillColor('#dc2626').font(fontBold).text(`Toplam Gider: ${fmtTL(totalExpense)}`, 45, afterExp, {
        align: 'right',
        width: pageW
      });
    }
    doc.y = afterExp + 18;

    // Sayfa kontrolü
    if (doc.y > 650) {
      doc.addPage();
    }

    // ── Sonuç Kutusu ──────────────────────────────────────────────────
    const resultY = doc.y + 8;
    doc.roundedRect(45, resultY, pageW, 70, 6).fill(netProfit >= 0 ? '#f0fdf4' : '#fef2f2').stroke(netProfit >= 0 ? '#16a34a' : '#dc2626');
    doc.fontSize(10).fillColor(TEXT_DARK).font(fontBold).text('ÖZET', 60, resultY + 12);
    doc.fontSize(9).fillColor(TEXT_GRAY).font(fontRegular).text(`Toplam Gelir: ${fmtTL(totalRevenue)}`, 60, resultY + 28).text(`Toplam Gider: ${fmtTL(totalExpense)}`, 60, resultY + 41);
    doc.fontSize(11).fillColor(netProfit >= 0 ? '#16a34a' : '#dc2626').font(fontBold).text(`Net ${netProfit >= 0 ? 'Kar' : 'Zarar'}: ${fmtTL(Math.abs(netProfit))}  (Marj: %${margin})`, 60, resultY + 55);

    // ── Footer ────────────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 45;
      doc.moveTo(45, footerY).lineTo(45 + pageW, footerY).lineWidth(0.5).strokeColor('#d1d5db').stroke();
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 45, footerY + 5, {
          height: 20
        });
      }
      doc.fontSize(7).fillColor(TEXT_GRAY).font(fontRegular).text('Mi Kurumsal CRM — Danışmanlık & Franchise Yönetim Sistemi', 45, footerY + 8, {
        width: pageW - 60,
        align: 'center'
      }).text(`Sayfa ${i + 1} / ${totalPages}`, 45, footerY + 18, {
        align: 'right',
        width: pageW
      });
    }
    doc.end();
  } catch (e) {
    next(e);
  }
});

// Excel Export

// Excel Export
router.get("/customer/:investorId/export-excel", authMiddleware, async (req, res, next) => {
  try {
    const XLSX = require("xlsx");
    const {
      investorId
    } = req.params;
    const {
      month,
      year
    } = req.query;
    let revQ = `SELECT * FROM customer_pnl_revenues WHERE investor_id=$1 ORDER BY entry_date`;
    let expQ = `SELECT * FROM customer_pnl_expenses WHERE investor_id=$1 ORDER BY entry_date`;
    const params = [investorId];
    if (month) {
      params.push(month);
      revQ = revQ.replace('ORDER', `AND month_name=$${params.length} ORDER`);
      expQ = expQ.replace('ORDER', `AND month_name=$${params.length} ORDER`);
    }
    if (year) {
      params.push(year);
      revQ = revQ.replace('ORDER', `AND year_value=$${params.length} ORDER`);
      expQ = expQ.replace('ORDER', `AND year_value=$${params.length} ORDER`);
    }
    const [revRows, expRows, invRes] = await Promise.all([pool.query(revQ, params), pool.query(expQ, params), pool.query(`SELECT * FROM investors WHERE id=$1`, [investorId])]);
    const investor = invRes.rows[0] || {};
    const revenues = revRows.rows;
    const expenses = expRows.rows;
    const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExpense = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const netProfit = totalRevenue - totalExpense;
    const wb = XLSX.utils.book_new();

    // Gelirler sheet
    const revData = [['Mi Kurumsal CRM — Müşteri Gelir Tablosu'], [`Müşteri: ${investor.name || ''}`, `Dönem: ${month || ''} ${year || ''}`], [], ['Tarih', 'Ay', 'Yıl', 'Kategori', 'Açıklama', 'Tutar (₺)'], ...revenues.map(r => [r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '', r.month_name || '', r.year_value || '', r.category || '', r.description || '', Number(r.amount || 0)]), [], ['', '', '', '', 'TOPLAM GELİR', totalRevenue]];
    const wsRev = XLSX.utils.aoa_to_sheet(revData);
    wsRev['!cols'] = [{
      wch: 14
    }, {
      wch: 10
    }, {
      wch: 6
    }, {
      wch: 14
    }, {
      wch: 28
    }, {
      wch: 14
    }];
    XLSX.utils.book_append_sheet(wb, wsRev, 'Gelirler');

    // Giderler sheet
    const expData = [['Mi Kurumsal CRM — Müşteri Gider Tablosu'], [`Müşteri: ${investor.name || ''}`, `Dönem: ${month || ''} ${year || ''}`], [], ['Tarih', 'Ay', 'Yıl', 'Kategori', 'Alt Kategori', 'Açıklama', 'Tutar (₺)'], ...expenses.map(r => [r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '', r.month_name || '', r.year_value || '', r.category || '', r.sub_category || '', r.description || '', Number(r.amount || 0)]), [], ['', '', '', '', '', 'TOPLAM GİDER', totalExpense]];
    const wsExp = XLSX.utils.aoa_to_sheet(expData);
    wsExp['!cols'] = [{
      wch: 14
    }, {
      wch: 10
    }, {
      wch: 6
    }, {
      wch: 14
    }, {
      wch: 14
    }, {
      wch: 24
    }, {
      wch: 14
    }];
    XLSX.utils.book_append_sheet(wb, wsExp, 'Giderler');

    // Özet sheet
    const ozet = [['Mi Kurumsal CRM — Müşteri Kar/Zarar Özeti'], [`Müşteri: ${investor.name || ''}`, `Sektör: ${investor.sector || ''}`, `Şehir: ${investor.city || ''}`], [`Tel: ${investor.phone || ''}`, `E-posta: ${investor.email || ''}`], [], ['Kalem', 'Tutar (₺)'], ['Toplam Gelir', totalRevenue], ['Toplam Gider', totalExpense], ['Net Kar/Zarar', netProfit], ['Kar Marjı (%)', totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(2) : 0], [], [`Oluşturma: ${new Date().toLocaleString('tr-TR')} — Mi Kurumsal CRM`]];
    const wsOzet = XLSX.utils.aoa_to_sheet(ozet);
    wsOzet['!cols'] = [{
      wch: 20
    }, {
      wch: 16
    }];
    XLSX.utils.book_append_sheet(wb, wsOzet, 'Özet');
    const buf = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx'
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="musteri-kar-zarar-${investorId}.xlsx"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

module.exports = router;
