'use client';
import { useState } from 'react';

type Tab = 'email' | 'sms' | 'search';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('email');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Email state
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');

  // SMS state
  const [smsTo, setSmsTo] = useState('');
  const [smsMsg, setSmsMsg] = useState('');

  // Search state
  const [searchQ, setSearchQ] = useState('');
  const [searchType, setSearchType] = useState('markets');
  const [searchResults, setSearchResults] = useState<Record<string,unknown>[]>([]);

  const sendEmail = async () => {
    setLoading(true); setStatus('');
    const to = emailTo.split('\n').map(s => s.trim()).filter(Boolean);
    const res = await fetch('/api/admin/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: emailSubject, html: emailHtml }),
    });
    const d = await res.json();
    setStatus(d.success ? `✅ Sent to ${d.sent} recipients` : `❌ ${d.error}`);
    setLoading(false);
  };

  const sendSMS = async () => {
    setLoading(true); setStatus('');
    const to = smsTo.split('\n').map(s => s.trim()).filter(Boolean);
    const res = await fetch('/api/admin/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message: smsMsg }),
    });
    const d = await res.json();
    setStatus(d.success ? `✅ Sent to ${d.sent} recipients` : `❌ ${d.error}`);
    setLoading(false);
  };

  const doSearch = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQ)}&type=${searchType}`);
    const d = await res.json();
    setSearchResults(d.results || []);
    setLoading(false);
  };

  const s = {
    page: { minHeight: '100vh', background: '#030712', color: '#f9fafb', fontFamily: '-apple-system,sans-serif', padding: '2rem' } as React.CSSProperties,
    card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: '1.5rem', maxWidth: 800, margin: '0 auto' } as React.CSSProperties,
    label: { fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' } as React.CSSProperties,
    input: { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 },
    textarea: { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12, resize: 'vertical' as const },
    btn: { padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 18px', fontSize: 13, cursor: 'pointer', border: 'none', borderRadius: 6, background: active ? '#4f46e5' : '#1f2937', color: active ? '#fff' : '#6b7280', fontWeight: active ? 600 : 400 } as React.CSSProperties),
  };

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Betg8 Admin Panel</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Email · SMS · Market Search</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['email','sms','search'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setStatus(''); }} style={s.tab(tab===t)}>
              {t === 'email' ? '📧 Email' : t === 'sms' ? '📱 SMS' : '🔍 Search'}
            </button>
          ))}
        </div>

        <div style={s.card}>
          {tab === 'email' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Send Email Campaign</h2>
              <label style={s.label}>Recipients (one per line, or comma separated)</label>
              <textarea rows={4} value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="user@example.com&#10;user2@example.com" style={s.textarea} />
              <label style={s.label}>Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="🏏 IPL Final Tonight — Trade Now!" style={s.input} />
              <label style={s.label}>HTML Body</label>
              <textarea rows={8} value={emailHtml} onChange={e => setEmailHtml(e.target.value)} placeholder="<h1>Big Market Alert!</h1><p>Trade now on Betg8...</p>" style={s.textarea} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={sendEmail} disabled={loading} style={s.btn}>{loading ? 'Sending...' : 'Send Email'}</button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{emailTo.split('\n').filter(Boolean).length} recipients</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                Requires RESEND_API_KEY in Vercel env vars. Get free key at resend.com (3,000 emails/mo free)
              </div>
            </>
          )}

          {tab === 'sms' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Send SMS Campaign</h2>
              <label style={s.label}>Phone numbers (one per line, with country code)</label>
              <textarea rows={4} value={smsTo} onChange={e => setSmsTo(e.target.value)} placeholder="+919876543210&#10;+918765432109" style={s.textarea} />
              <label style={s.label}>Message (max 160 chars)</label>
              <textarea rows={3} value={smsMsg} onChange={e => setSmsMsg(e.target.value.slice(0, 160))} placeholder="Betg8: Big IPL market open! Trade YES/NO now → betg8.com" style={s.textarea} />
              <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>{smsMsg.length}/160 chars</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={sendSMS} disabled={loading} style={s.btn}>{loading ? 'Sending...' : 'Send SMS'}</button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{smsTo.split('\n').filter(Boolean).length} recipients</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                Requires TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM in Vercel env vars. twilio.com/try-twilio
              </div>
            </>
          )}

          {tab === 'search' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Search Polymarket</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key==='Enter'&&doSearch()}
                  placeholder="IPL, Bitcoin, Trump, Iran..." style={{ ...s.input, marginBottom: 0, flex: 1 }} />
                <select value={searchType} onChange={e => setSearchType(e.target.value)}
                  style={{ padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', outline: 'none' }}>
                  <option value="markets">Markets</option>
                  <option value="events">Events</option>
                </select>
                <button onClick={doSearch} disabled={loading} style={s.btn}>{loading ? '...' : 'Search'}</button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{searchResults.length} results</div>
                  {searchResults.map((r, i) => {
                    const title = String(r.title || r.question || '');
                    const vol = parseFloat(String(r.volume || '0'));
                    const slug = String(r.slug || r.market_slug || '');
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#1f2937', marginBottom: 6, fontSize: 13, cursor: 'pointer' }}
                        onClick={() => window.open(`/event/${slug}`, '_blank')}>
                        <span style={{ color: '#e2e8f0', flex: 1, marginRight: 12 }}>{title}</span>
                        <span style={{ color: '#4b5563', whiteSpace: 'nowrap' }}>${vol >= 1e6 ? (vol/1e6).toFixed(1)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : vol.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {status && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: status.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: status.startsWith('✅') ? '#4ade80' : '#f87171', fontSize: 13 }}>
              {status}
            </div>
          )}
        </div>

        {/* Setup guide */}
        <div style={{ marginTop: 20, background: '#0d1117', border: '1px solid #1f2937', borderRadius: 12, padding: '1.25rem', maxWidth: 800 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af', marginBottom: 12 }}>⚙️ Setup Required (add to Vercel env vars)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
            <div>
              <div style={{ color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>Email (Resend - free)</div>
              <code style={{ color: '#818cf8', display: 'block', marginBottom: 3 }}>RESEND_API_KEY=re_...</code>
              <code style={{ color: '#818cf8', display: 'block' }}>EMAIL_FROM=Betg8 &lt;noreply@betg8.com&gt;</code>
              <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#4b5563', display: 'block', marginTop: 4 }}>→ resend.com (free tier: 3k/mo)</a>
            </div>
            <div>
              <div style={{ color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>SMS (Twilio)</div>
              <code style={{ color: '#818cf8', display: 'block', marginBottom: 3 }}>TWILIO_SID=AC...</code>
              <code style={{ color: '#818cf8', display: 'block', marginBottom: 3 }}>TWILIO_TOKEN=...</code>
              <code style={{ color: '#818cf8', display: 'block' }}>TWILIO_FROM=+1...</code>
              <a href="https://twilio.com/try-twilio" target="_blank" rel="noreferrer" style={{ color: '#4b5563', display: 'block', marginTop: 4 }}>→ twilio.com (free trial: $15)</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
