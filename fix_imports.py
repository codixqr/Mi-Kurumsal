import sys
with open('express-server/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'app.post("/api/pnl/import-preview", authMiddleware, upload.single("excelFile"), async (req, res) => {',
    'app.post("/api/pnl/import-preview", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {'
)

content = content.replace(
    'app.post("/api/investors/import", authMiddleware, upload.single("excelFile"), async (req, res) => {',
    'app.post("/api/investors/import", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {'
)

content = content.replace(
    'app.post("/api/brands/import", authMiddleware, upload.single("excelFile"), async (req, res) => {',
    'app.post("/api/brands/import", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {'
)

content = content.replace(
    'app.post("/api/pnl/import", authMiddleware, upload.single("excelFile"), async (req, res) => {',
    'app.post("/api/pnl/import", authMiddleware, uploadLocal.single("excelFile"), async (req, res) => {'
)

content = content.replace(
    '''app.post("/api/pnl/customer/:investorId/import-excel", authMiddleware, upload.single('file'), async (req, res, next) => {''',
    '''app.post("/api/pnl/customer/:investorId/import-excel", authMiddleware, uploadLocal.single('file'), async (req, res, next) => {'''
)

with open('express-server/index.js', 'w', encoding='utf-8') as f:
    f.write(content)
