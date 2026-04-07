'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';

interface Position {
  market: string; title?: string; outcome: string; size: number;
  avgPrice: number; curPrice?: number; currentPrice?: number;
}
interface Trade {
  title?: string; outcome?: string; side?: string; size?: number;
  price?: number; amount?: number; timestamp?: number;
}

function fmtUSD(v: number) { return `$${Math.abs(v).toFixed(2)}`; }
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

export default function Portfolio() {
  const router = useRouter();
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [tab, setTab] = useState<'positions'|'history'>('positions');
  const [data, setData] = useState<{ positions: Position[]; trades: Trade[]; totalBought: number; totalCurrent: number; totalPnl: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState<'idle'|'pending'|'done'>('idle');

  const wallet = wallets[0];
  const address = wallet?.address;

  // Fetch USDC balance from Polygon
  useEffect(() => {
    if (!address) return;
    const fetchBal = async () => {
      try {
        const res = await fetch('https://polygon-bor-rpc.publicnode.com', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', data: `0x70a08231000000000000000000000000${address.slice(2)}` }, 'latest'], id: 1 }),
        });
        const d = await res.json();
        if (d.result && d.result !== '0x') setBalance((parseInt(d.result, 16) / 1e6).toFixed(2));
      } catch { /* ignore */ }
    };
    fetchBal();
    const t = setInterval(fetchBal, 15000);
    return () => clearInterval(t);
  }, [address]);

  // Fetch portfolio from Polymarket data API
  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/portfolio?address=${address}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [address]);

  // "Add Fund" = Privy's own fund wallet modal (Moonpay/Coinbase onramp)
  const handleWithdraw = async () => {
    const wallet = wallets[0];
    if (!wallet || !withdrawAddr || !withdrawAmt || parseFloat(withdrawAmt) <= 0) return;
    setWithdrawStatus('pending');
    try {
      const provider = await wallet.getEthereumProvider();
      const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
      const amt = Math.floor(parseFloat(withdrawAmt) * 1e6);
      const amtHex = amt.toString(16).padStart(64, '0');
      const toHex = withdrawAddr.replace('0x','').padStart(64, '0');
      const data = `0xa9059cbb${toHex}${amtHex}`;
      await provider.request({ method: 'eth_sendTransaction', params: [{ from: wallet.address, to: USDC, data, chainId: '0x89' }] });
      setWithdrawStatus('done');
    } catch { setWithdrawStatus('idle'); setShowWithdraw(false); }
  };

  const positions: Position[] = data?.positions || [];
  const trades: Trade[] = data?.trades || [];
  const totalPnl = data?.totalPnl || 0;
  const totalBought = data?.totalBought || 0;
  const totalCurrent = data?.totalCurrent || 0;
  const totalSold = trades.filter(t => t.side === 'SELL').reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, height: 52 }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: 'white' }}>B</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Betg8</span>
        </button>
        <span style={{ color: '#d1d5db' }}>›</span>
        <span style={{ fontSize: 14, color: '#6b7280' }}>Portfolio</span>
        <div style={{ marginLeft: 'auto' }}>
          {authenticated && <button onClick={logout} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: '1px solid #e5e7eb', padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}>Sign out</button>}
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        {!authenticated ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Connect your wallet to view portfolio</div>
            <button onClick={login} style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' }}>Connect Wallet</button>
          </div>
        ) : (
          <>
            {/* Balance cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* USDC Balance */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', fontWeight: 700 }}>$</div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.5px' }}>BALANCE</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>
                      ${balance ?? '--'} <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>USDC</span>
                    </div>
                  </div>
                </div>
                {/* 
                  Withdraw = user's own wallet, they manage it themselves.
                  We just link to PolygonScan so they can see/manage.
                  Add Fund = Privy fundWallet (Moonpay/Coinbase card purchase).
                */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setWithdrawAddr(''); setWithdrawAmt(''); setWithdrawStatus('idle'); setShowWithdraw(true); }}
                    style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' }}>
                    ↑ Withdraw
                  </button>
                  <button onClick={() => setShowDeposit(true)}
                    style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#111827', color: '#fff' }}>
                    ↓ Add Fund
                  </button>
                </div>
                {address && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Your wallet address {address.slice(0, 10)}...{address.slice(-4)}
                    <button onClick={() => navigator.clipboard.writeText(address)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 11 }}>📋</button>
                  </div>
                )}
              </div>

              {/* PnL Summary */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
                  {[
                    { label: 'BOUGHT', value: fmtUSD(totalBought) },
                    { label: 'CURRENT', value: fmtUSD(totalCurrent) },
                    { label: 'SOLD', value: fmtUSD(totalSold) },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.5px', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Total PnL</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                  {totalPnl >= 0 ? '+' : '-'}{fmtUSD(totalPnl)}{' '}
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {totalBought > 0 ? ((totalPnl / totalBought) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
              </div>
            </div>

            {/* Positions / History tabs */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                {(['positions', 'history'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{ flex: 1, padding: '14px', fontSize: 14, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', border: 'none', background: 'transparent', color: tab === t ? '#4f46e5' : '#6b7280', borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent', marginBottom: -1 }}>
                    {t === 'positions' ? 'Positions' : 'History'}
                  </button>
                ))}
              </div>

              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
              ) : tab === 'positions' ? (
                positions.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
                    <div style={{ color: '#9ca3af', marginBottom: 16 }}>No open positions</div>
                    <button onClick={() => router.push('/')}
                      style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' }}>
                      Browse Markets →
                    </button>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Market', 'Outcome', 'Shares', 'Avg Price', 'Current', 'Value', 'PnL'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Market' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p, i) => {
                        const curPrice = p.curPrice || p.currentPrice || p.avgPrice;
                        const curVal = (curPrice || 0) * p.size;
                        const initVal = (p.avgPrice || 0) * p.size;
                        const pnl = curVal - initVal;
                        const pnlPct = initVal > 0 ? (pnl / initVal) * 100 : 0;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{p.title || p.market}</div>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 4, background: p.outcome === 'Yes' ? '#f0fdf4' : '#fef2f2', color: p.outcome === 'Yes' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>
                                {p.outcome} · Sell
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>{p.size?.toLocaleString()}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{((p.avgPrice || 0) * 100).toFixed(1)}¢</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>{((curPrice || 0) * 100).toFixed(1)}¢</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>${curVal.toFixed(2)}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} <span style={{ fontSize: 11, fontWeight: 400 }}>({pnlPct.toFixed(1)}%)</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              ) : (
                trades.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>No trade history</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Market', 'Side', 'Outcome', 'Shares', 'Price', 'Total', 'Time'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Market' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '—'}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, background: t.side === 'BUY' ? '#eff6ff' : '#fef2f2', color: t.side === 'BUY' ? '#2563eb' : '#dc2626', fontWeight: 600, fontSize: 12 }}>{t.side}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, background: t.outcome === 'Yes' ? '#f0fdf4' : '#fef2f2', color: t.outcome === 'Yes' ? '#16a34a' : '#dc2626', fontSize: 12 }}>{t.outcome}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>{t.size?.toLocaleString()}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{((t.price || 0) * 100).toFixed(1)}¢</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>${t.amount?.toFixed(2) || '—'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#9ca3af' }}>{t.timestamp ? timeAgo(t.timestamp) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </>
        )}
      </div>
      {/* Deposit Modal Portal */}
      {showDeposit && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => e.target === e.currentTarget && setShowDeposit(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 420, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Add Funds</div>
              <button onClick={() => setShowDeposit(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Send USDC to your Polygon wallet to start trading</div>
            <a href={`https://buy.moonpay.com?walletAddress=${address}&currencyCode=usdc_polygon`} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 10, textDecoration: 'none', color: '#111827', cursor: 'pointer' }}>
              <span style={{ fontSize: 24 }}>💳</span>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>Buy with Card</div><div style={{ fontSize: 12, color: '#9ca3af' }}>Credit/debit card via Moonpay</div></div>
              <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>→</span>
            </a>
            <div style={{ padding: '14px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>🏦</span>
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>Send from Exchange</div><div style={{ fontSize: 12, color: '#9ca3af' }}>Binance, Coinbase, WazirX etc.</div></div>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Your Polygon wallet address:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' as const }}>{address}</code>
                <button onClick={() => navigator.clipboard.writeText(address || '')} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Copy</button>
              </div>
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>⚠️ Send only USDC on Polygon network</div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' as const }}>Current balance: <strong>{balance ?? '0'} USDC</strong></div>
          </div>
        </div>,
        document.body
      )}
      {/* Withdraw Modal Portal */}
      {showWithdraw && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => e.target === e.currentTarget && setShowWithdraw(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 380, maxWidth: '90vw' }}>
            {withdrawStatus === 'done' ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Sent!</div>
                <button onClick={() => setShowWithdraw(false)} style={{ padding: '8px 24px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>Withdraw USDC</div>
                  <button onClick={() => setShowWithdraw(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Send USDC from your Polygon wallet</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Amount (USDC)</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>$</span>
                  <input type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} placeholder="0.00" min="0"
                    style={{ width: '100%', padding: '10px 10px 10px 24px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {[25, 50, 75, 100].map(pct => (
                    <button key={pct} onClick={() => setWithdrawAmt((parseFloat(balance||'0') * pct / 100).toFixed(2))}
                      style={{ flex: 1, padding: '4px', fontSize: 11, borderRadius: 5, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>{pct}%</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Destination Address</div>
                <input value={withdrawAddr} onChange={e => setWithdrawAddr(e.target.value)} placeholder="0x..."
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace', marginBottom: 14 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowWithdraw(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                  <button onClick={handleWithdraw} disabled={withdrawStatus === 'pending' || !withdrawAddr || !withdrawAmt}
                    style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: !withdrawAddr || !withdrawAmt ? '#e5e7eb' : '#111827', color: !withdrawAddr || !withdrawAmt ? '#9ca3af' : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                    {withdrawStatus === 'pending' ? 'Confirm in wallet...' : `Withdraw $${withdrawAmt || '0'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
