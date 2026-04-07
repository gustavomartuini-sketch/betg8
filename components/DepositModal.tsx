'use client';

import { useState } from 'react';
import { Lang } from '@/lib/i18n';

interface Props {
  lang: Lang;
  inrRate: number;
  onClose: () => void;
}

const UPI_APPS = [
  { name: 'PhonePe', color: '#5f259f', logo: 'P' },
  { name: 'GPay', color: '#1a73e8', logo: 'G' },
  { name: 'Paytm', color: '#00b9f1', logo: 'Pt' },
  { name: 'UPI', color: '#FF6B00', logo: '↑' },
];

const P2P_STEPS = [
  { step: '1', en: 'Enter INR amount', hi: 'INR राशि दर्ज करें' },
  { step: '2', en: 'Send via UPI to our P2P desk', hi: 'UPI से P2P डेस्क को भेजें' },
  { step: '3', en: 'USDC credited to your wallet within 15 min', hi: '15 मिनट में USDC आपके वॉलेट में' },
  { step: '4', en: 'Start trading on Polymarket', hi: 'Polymarket पर ट्रेड शुरू करें' },
];

export function DepositModal({ lang, inrRate, onClose }: Props) {
  const [tab, setTab] = useState<'upi' | 'crypto'>('upi');
  const [amount, setAmount] = useState(1000);
  const usdcAmount = (amount / inrRate).toFixed(2);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const modalStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: 16, padding: '1.5rem', width: '90%', maxWidth: 420,
    maxHeight: '90vh', overflowY: 'auto',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {lang === 'hi' ? 'जमा करें' : 'Add Funds'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--color-background-secondary)', borderRadius: 8, padding: 4 }}>
          {(['upi', 'crypto'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              border: 'none', fontWeight: tab === t ? 500 : 400,
              background: tab === t ? 'var(--color-background-primary)' : 'transparent',
              color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}>
              {t === 'upi' ? (lang === 'hi' ? 'UPI / भारतीय' : 'UPI / Indian') : 'Crypto (USDT)'}
            </button>
          ))}
        </div>

        {tab === 'upi' && (
          <>
            {/* Amount */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                {lang === 'hi' ? 'INR राशि' : 'Amount in INR'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: 'var(--color-text-secondary)' }}>₹</span>
                <input
                  type="number" value={amount} min={500} step={100}
                  onChange={e => setAmount(Math.max(500, Number(e.target.value)))}
                  style={{
                    flex: 1, padding: '10px 12px', fontSize: 15, borderRadius: 8,
                    border: '0.5px solid var(--color-border-secondary)',
                    background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                = {usdcAmount} USDC · Rate: ₹{inrRate.toFixed(1)}/USDC
              </div>
            </div>

            {/* Quick amounts */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {[500, 1000, 2500, 5000, 10000].map(v => (
                <button key={v} onClick={() => setAmount(v)} style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                  border: `0.5px solid ${amount === v ? '#FF6B00' : 'var(--color-border-secondary)'}`,
                  background: amount === v ? '#FFF0E6' : 'transparent',
                  color: amount === v ? '#FF6B00' : 'var(--color-text-secondary)',
                }}>
                  ₹{v.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            {/* UPI methods */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {UPI_APPS.map(app => (
                <button key={app.name} style={{
                  padding: '10px 4px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                  border: '0.5px solid var(--color-border-tertiary)',
                  background: 'var(--color-background-secondary)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: app.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 4px', color: 'white', fontSize: 12, fontWeight: 500,
                  }}>{app.logo}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{app.name}</div>
                </button>
              ))}
            </div>

            {/* Steps */}
            <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 12, marginBottom: 16 }}>
              {P2P_STEPS.map(s => (
                <div key={s.step} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#FF6B00',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 11, fontWeight: 500, flexShrink: 0, marginTop: 1,
                  }}>{s.step}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    {lang === 'hi' ? s.hi : s.en}
                  </div>
                </div>
              ))}
            </div>

            <button style={{
              width: '100%', padding: '12px', fontSize: 14, fontWeight: 500,
              background: '#FF6B00', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>
              {lang === 'hi' ? `₹${amount.toLocaleString('en-IN')} से जमा करें →` : `Deposit ₹${amount.toLocaleString('en-IN')} →`}
            </button>

            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 8 }}>
              Min ₹500 · P2P rate · Typically 10–15 min
            </div>
          </>
        )}

        {tab === 'crypto' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              {lang === 'hi'
                ? 'अपना USDT/USDC Polygon नेटवर्क पर सीधे भेजें:'
                : 'Send USDT or USDC directly on Polygon network:'}
            </div>
            {['USDC (Polygon)', 'USDT (TRC20 → bridge)', 'USDT (Polygon)'].map(c => (
              <div key={c} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#046A38' }} />
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{c}</span>
              </div>
            ))}
            <div style={{
              background: 'var(--color-background-secondary)', borderRadius: 8, padding: '12px',
              marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5,
            }}>
              {lang === 'hi'
                ? 'Binance, WazirX या Mudrex से USDC निकालें और अपने Polymarket-linked wallet पर भेजें।'
                : 'Withdraw USDC from Binance, WazirX, or Mudrex and send to your Polymarket-linked wallet.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
