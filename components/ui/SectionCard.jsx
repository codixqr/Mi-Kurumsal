export function SectionCard({ title, children, href, accent }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: accent ? `${accent}08` : '#fafafa',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: accent || '#1e293b' }}>
          {title}
        </span>
        {href && (
          <a
            href={href}
            style={{ fontSize: '0.75rem', color: '#1a5c38', textDecoration: 'none', fontWeight: 600 }}
          >
            Tümü →
          </a>
        )}
      </div>
      <div style={{ padding: '6px 0', flex: 1 }}>{children}</div>
    </div>
  );
}
