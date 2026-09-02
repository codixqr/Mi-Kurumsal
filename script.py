# -*- coding: utf-8 -*-
import sys

with open('app/(dashboard)/investors/page.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

form_start = content.find('<form onSubmit={saveInvestor}>')
form_end = content.find('</form>', form_start) + 7
form_html = content[form_start:form_end]

form_html = form_html.replace('onSubmit={saveInvestor}', 'onSubmit={(e) => { e.preventDefault(); saveInvestor(e).then(() => { setDetail({ ...detail, investor: { ...detail.investor, ...form } }); setDetailTab(\'genel\'); }); }}')

content = content.replace(
    "['finans', 'Finans']",
    "['finans', 'Finans'], ['edit', 'Düzenle']"
)

content = content.replace(
    "onClick={() => setDetailTab(t)}",
    "onClick={() => setDetailTab(t)} style={t === 'edit' ? { display: 'none' } : {}}"
)

detail_idx = content.find('detailOpen && detail?.investor && (')
modal_body_idx = content.find('<div className="inv-modal-body">', detail_idx)

modal_body = '<div className="inv-modal-body">'
new_body = f"{modal_body}\n              {{detailTab === 'edit' && (\n                {form_html}\n              )}}"

content = content[:modal_body_idx] + content[modal_body_idx:].replace(modal_body, new_body, 1)

# And fix the header buttons
header_find = '''              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="edit-btn" onClick={() => { setDetailOpen(false); editRow(detail.investor); }}>Düzenle</button>
                <button type="button" className="secondary-btn" onClick={() => setDetailOpen(false)}>
                  Kapat
                </button>
              </div>'''
header_repl = '''              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="danger-btn" onClick={() => { setDetailOpen(false); deleteRow(detail.investor); }}>Sil</button>
                <button type="button" className="edit-btn" onClick={() => { editRow(detail.investor); setDetailTab('edit'); setDetailOpen(true); }}>Düzenle</button>
                <button type="button" className="secondary-btn" onClick={() => setDetailOpen(false)}>
                  Kapat
                </button>
              </div>'''
content = content.replace(header_find, header_repl)

with open('app/(dashboard)/investors/page.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
