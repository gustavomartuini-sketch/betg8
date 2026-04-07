'use client';

import { useState } from 'react';

type Tab = 'email' | 'sms' | 'subscribers';

export default function MarketingPortal() {
  const [tab, setTab] = useState<Tab>('email');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Email state
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');
  const [emailPreview, setEmailPreview] = useState(false);

  // SMS state
  const [smsTo, setSmsTo] = useState('');
  const [smsMsg, setSmsMsg] = useState('');

  // Subscribers (localStorage based for now)
  const [newEmail, setNewEmail] = useState('');
  const [subscribers, setSubscribers] = useState<{email: string; date: string}[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('betg8_subscribers') || '[]'); } catch { return []; }
  });

  const addSubscriber = () => {
    if (!newEmail || !newEmail.includes('@')) return;
    const list = [...subscribers, { email: newEmail, date: new Date().toLocaleDateString() }];
    setSubscribers(list);
    localStorage.setItem('betg8_subscribers', JSON.stringify(list));
    setEmailTo(prev => prev ? prev + '\n' + newEmail : newEmail);
    setNewEmail('');
  };

  const exportCSV = () => {
    const csv = 'email,date\n' + subscribers.map(s => `${s.email},${s.date}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'betg8_subscribers.csv'; a.click();
  };

  const sendEmail = async () => {
    setLoading(true); setStatus('');
    const to = emailTo.split('\n').map(s => s.trim()).filter(Boolean);
    if (to.length === 0) { setStatus('❌ No recipients'); setLoading(false); return; }
    try {
      const res = await fetch('/api/admin/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: emailSubject, html: emailHtml }),
      });
      const d = await res.json();
      setStatus(d.success ? `✅ Sent to ${d.sent} recipients` : `❌ ${d.error}`);
    } catch { setStatus('❌ Error sending'); }
    setLoading(false);
  };

  const sendSMS = async () => {
    setLoading(true); setStatus('');
    const to = smsTo.split('\n').map(s => s.trim()).filter(Boolean);
    if (to.length === 0) { setStatus('❌ No recipients'); setLoading(false); return; }
    try {
      const res = await fetch('/api/admin/send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: smsMsg }),
      });
      const d = await res.json();
      setStatus(d.success ? `✅ SMS sent to ${d.sent}` : `❌ ${d.error}`);
    } catch { setStatus('❌ Error'); }
    setLoading(false);
  };

  const s = {
    page: { minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system,sans-serif' } as React.CSSProperties,
    header: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
    card: { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', maxWidth: 760, margin: '0 auto' } as React.CSSProperties,
    label: { fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6, display: 'block' } as React.CSSProperties,
    input: { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12, background: '#f9fafb' },
    textarea: { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12, resize: 'vertical' as const, background: '#f9fafb' },
    btn: { padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' } as React.CSSProperties,
    tabBtn: (active: boolean) => ({ padding: '8px 18px', fontSize: 13, cursor: 'pointer', border: 'none', borderRadius: 6, background: active ? '#4f46e5' : '#f3f4f6', color: active ? '#fff' : '#6b7280', fontWeight: active ? 600 : 400 } as React.CSSProperties),
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: 'white' }}>B</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Betg8</span>
          </a>
          <span style={{ color: '#d1d5db' }}>›</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Marketing Portal</span>
        </div>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Admin only</span>
      </div>

      <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 16px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['email','sms','subscribers'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setStatus(''); }} style={s.tabBtn(tab===t)}>
              {t === 'email' ? '📧 Email Campaign' : t === 'sms' ? '📱 SMS Campaign' : `👥 Subscribers (${subscribers.length})`}
            </button>
          ))}
        </div>

        <div style={s.card}>
          {tab === 'email' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, margin: '0 0 16px' }}>Email Campaign</h2>
              <label style={s.label}>Recipients (one per line)</label>
              <textarea rows={4} value={emailTo} onChange={e => setEmailTo(e.target.value)}
                placeholder="user@example.com&#10;user2@example.com" style={s.textarea} />
              <label style={s.label}>Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                placeholder="🏏 New prediction markets open on Betg8!" style={s.input} />
              <label style={s.label}>HTML Body</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <button onClick={() => setEmailPreview(!emailPreview)} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: emailPreview ? '#4f46e5' : '#fff', color: emailPreview ? '#fff' : '#374151' }}>
                  {emailPreview ? 'Edit' : 'Preview'}
                </button>
                <button onClick={() => setEmailHtml(`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="color:#4f46e5">🎯 New Markets on Betg8!</h1>
  <p>Trade on the world's biggest prediction markets. Who will win the next election? Will Bitcoin hit $100k?</p>
  <a href="https://betg8.com" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Trade Now →</a>
  <p style="color:#9ca3af;font-size:12px;margin-top:20px">Powered by Polymarket · Non-custodial · Polygon</p>
</div>`)} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>
                  Use template
                </button>
              </div>
              {emailPreview ? (
                <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 16, marginBottom: 12, minHeight: 100, background: '#fff' }} dangerouslySetInnerHTML={{ __html: emailHtml }} />
              ) : (
                <textarea rows={8} value={emailHtml} onChange={e => setEmailHtml(e.target.value)}
                  placeholder="<h1>Hello!</h1><p>Check out new prediction markets on Betg8...</p>" style={s.textarea} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={sendEmail} disabled={loading} style={s.btn}>{loading ? 'Sending...' : 'Send Email'}</button>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{emailTo.split('\n').filter(Boolean).length} recipients</span>
              </div>
              <div style={{ marginTop: 10, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
                ⚙️ Requires <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>RESEND_API_KEY</code> in Vercel env vars → <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#4f46e5' }}>resend.com</a> (3,000 emails/mo free)
              </div>
            </>
          )}

          {tab === 'sms' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>SMS Campaign</h2>
              <label style={s.label}>Phone numbers (one per line, with country code)</label>
              <textarea rows={4} value={smsTo} onChange={e => setSmsTo(e.target.value)}
                placeholder="+919876543210&#10;+918765432109&#10;+905551234567" style={s.textarea} />
              <label style={s.label}>Message ({smsMsg.length}/160)</label>
              <textarea rows={3} value={smsMsg} onChange={e => setSmsMsg(e.target.value.slice(0,160))}
                placeholder="Betg8: New IPL markets open! Trade YES/NO → betg8.com" style={s.textarea} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={sendSMS} disabled={loading} style={s.btn}>{loading ? 'Sending...' : 'Send SMS'}</button>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{smsTo.split('\n').filter(Boolean).length} recipients</span>
              </div>
              <div style={{ marginTop: 10, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
                ⚙️ Requires <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>TWILIO_SID</code>, <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>TWILIO_TOKEN</code>, <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>TWILIO_FROM</code> → <a href="https://twilio.com" target="_blank" rel="noreferrer" style={{ color: '#4f46e5' }}>twilio.com</a>
              </div>
            </>
          )}

          {tab === 'subscribers' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Subscriber List</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key==='Enter'&&addSubscriber()}
                  placeholder="Add email manually..." style={{ ...s.input, marginBottom: 0, flex: 1 }} />
                <button onClick={addSubscriber} style={{ ...s.btn, padding: '9px 16px' }}>Add</button>
                <button onClick={exportCSV} disabled={subscribers.length===0} style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>⬇ CSV</button>
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
                <strong>{subscribers.length}</strong> subscribers saved locally. To send to all: click "Use all" below.
              </div>
              {subscribers.length > 0 && (
                <>
                  <button onClick={() => { setEmailTo(subscribers.map(s=>s.email).join('\n')); setTab('email'); }}
                    style={{ marginBottom: 12, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid #4f46e5', background: 'rgba(79,70,229,0.05)', color: '#4f46e5', fontWeight: 500 }}>
                    → Use all in email campaign
                  </button>
                  <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    {subscribers.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                        <span style={{ color: '#374151' }}>{s.email}</span>
                        <span style={{ color: '#9ca3af', fontSize: 11 }}>{s.date}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {subscribers.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: 8 }}>
                  No subscribers yet. Add manually or integrate a signup form on your site.
                </div>
              )}
            </>
          )}

          {status && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: status.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: status.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13 }}>
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
