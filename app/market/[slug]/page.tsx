'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { buildOrderParams } from '@/lib/polymarket-live';

interface Token { token_id: string; outcome: string; price: string; winner?: boolean; }
interface OrderLevel { price: string; size: string; }
interface Book { bids: OrderLevel[]; asks: OrderLevel[]; }
interface Trade { size: number; price: number; side: string; timestamp: number; outcome: string; name?: string; pseudonym?: string; proxyWallet?: string; }
interface Market {
  condition_id: string; question: string; description?: string;
  image?: string; icon?: string; end_date_iso?: string; endDate?: string;
  volume?: string; volumeNum?: number; volume24hr?: number;
  open_interest?: string; tokens?: Token[]; tags?: { label: string; slug: string }[];
  market_slug?: string; liquidity?: string;
}

function fmtVol(v: number): string {
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ── Trade Panel (right column) ────────────────────────────────────────────────
function TradePanel({ market }: { market: Market }) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [mode, setMode] = useState<'buy'|'sell'>('buy');
  const [outcome, setOutcome] = useState<'Yes'|'No'>('Yes');
  const [shares, setShares] = useState(0);
  const [customPrice, setCustomPrice] = useState(0);
  const [status, setStatus] = useState<'idle'|'signing'|'submitting'|'done'|'error'>('idle');
  const [orderId, setOrderId] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
  const noToken = market.tokens?.find(t => t.outcome === 'No');
  const yesPrice = parseFloat(yesToken?.price || '0.5');
  const noPrice = parseFloat(noToken?.price || '0.5');
  const activePrice = outcome === 'Yes' ? yesPrice : noPrice;
  const activeToken = outcome === 'Yes' ? yesToken : noToken;

  useEffect(() => {
    setCustomPrice(Math.round(activePrice * 1000) / 10);
  }, [activePrice, outcome]);

  const total = (shares * customPrice / 100);
  const payout = shares;
  const ret = payout - total;
  const retPct = total > 0 ? ((ret / total) * 100).toFixed(0) : '0';

  const adjustPrice = (delta: number) => setCustomPrice(p => Math.max(0.1, Math.min(99.9, +(p + delta).toFixed(1))));
  const adjustShares = (delta: number) => setShares(s => Math.max(0, s + delta));

  const handleTrade = async () => {
    if (!authenticated) { login(); return; }
    const wallet = wallets[0];
    if (!wallet || !activeToken || shares === 0) return;
    setStatus('signing'); setErrMsg('');
    try {
      const provider = await wallet.getEthereumProvider();
      const orderParams = buildOrderParams({
        tokenId: activeToken.token_id, side: mode === 'buy' ? 'BUY' : 'SELL',
        price: customPrice / 100, size: total, makerAddress: wallet.address,
      });
      const domain = { name: 'Polymarket CTF Exchange', version: '1', chainId: 137, verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' };
      const types = { Order: [
        {name:'salt',type:'uint256'},{name:'maker',type:'address'},{name:'signer',type:'address'},
        {name:'taker',type:'address'},{name:'tokenId',type:'uint256'},{name:'makerAmount',type:'uint256'},
        {name:'takerAmount',type:'uint256'},{name:'expiration',type:'uint256'},{name:'nonce',type:'uint256'},
        {name:'feeRateBps',type:'uint256'},{name:'side',type:'uint8'},{name:'signatureType',type:'uint8'},
      ]};
      const sig = await provider.request({ method: 'eth_signTypedData_v4', params: [wallet.address, JSON.stringify({ domain, types, primaryType: 'Order', message: orderParams })] });
      setStatus('submitting');
      const res = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signedOrder: { ...orderParams, signature: sig } }) });
      const d = await res.json();
      if (d.success || d.orderId) { setOrderId(d.orderId || 'submitted'); setStatus('done'); setShares(0); }
      else { setErrMsg(d.error || 'Order failed'); setStatus('error'); }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrMsg(err?.message?.includes('rejected') ? 'Cancelled' : err?.message?.slice(0, 80) || 'Error');
      setStatus('error');
    }
  };

  const s: Record<string, React.CSSProperties> = {
    panel: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: '1rem', position: 'sticky', top: 60 },
    buySell: { display: 'flex', gap: 4, marginBottom: 12, background: '#1f2937', borderRadius: 8, padding: 3 },
    bsBtn: { flex: 1, padding: '7px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', transition: 'all 0.15s' },
    outcomeRow: { display: 'flex', gap: 8, marginBottom: 12 },
    outcomeBtn: { flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', border: 'none', fontSize: 14, fontWeight: 700, textAlign: 'center' as const },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    label: { fontSize: 12, color: '#6b7280' },
    priceAdj: { display: 'flex', gap: 4, alignItems: 'center' },
    adjBtn: { padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #374151', background: '#1f2937', color: '#9ca3af' },
    priceVal: { padding: '4px 10px', fontSize: 14, fontWeight: 600, color: '#f9fafb', background: '#1f2937', borderRadius: 6, minWidth: 50, textAlign: 'center' as const },
    sharesInput: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' as const },
    sharesVal: { flex: 1, padding: '6px 10px', fontSize: 14, fontWeight: 600, color: '#f9fafb', background: '#1f2937', borderRadius: 6, textAlign: 'center' as const, minWidth: 60 },
    shortcut: { padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #374151', background: '#1f2937', color: '#9ca3af' },
    divider: { borderTop: '1px solid #1f2937', margin: '10px 0' },
    totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 },
    connectBtn: { width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, borderRadius: 10, cursor: 'pointer', border: 'none', marginTop: 10 },
  };

  return (
    <div style={s.panel}>
      {/* Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={s.buySell}>
          {(['buy','sell'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ ...s.bsBtn, background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#111827' : '#9ca3af' }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Balance: {authenticated ? '$0.00' : '--'}</span>
      </div>

      {/* Yes / No buttons */}
      <div style={s.outcomeRow}>
        <button onClick={() => setOutcome('Yes')} style={{ ...s.outcomeBtn,
          background: outcome === 'Yes' ? '#22c55e' : 'rgba(34,197,94,0.1)',
          color: outcome === 'Yes' ? '#fff' : '#4ade80',
          border: `1px solid ${outcome === 'Yes' ? '#22c55e' : 'rgba(34,197,94,0.3)'}` }}>
          Yes {Math.round(yesPrice * 100)}¢
        </button>
        <button onClick={() => setOutcome('No')} style={{ ...s.outcomeBtn,
          background: outcome === 'No' ? '#ef4444' : 'rgba(239,68,68,0.1)',
          color: outcome === 'No' ? '#fff' : '#f87171',
          border: `1px solid ${outcome === 'No' ? '#ef4444' : 'rgba(239,68,68,0.3)'}` }}>
          No {Math.round(noPrice * 100)}¢
        </button>
      </div>

      {/* Price adjust */}
      <div style={s.row}>
        <span style={s.label}>Price (¢)</span>
        <div style={s.priceAdj}>
          <button style={s.adjBtn} onClick={() => adjustPrice(-1)}>-1¢</button>
          <button style={s.adjBtn} onClick={() => adjustPrice(-0.1)}>-0.1¢</button>
          <span style={s.priceVal}>{customPrice.toFixed(1)}</span>
          <button style={s.adjBtn} onClick={() => adjustPrice(0.1)}>+0.1¢</button>
          <button style={s.adjBtn} onClick={() => adjustPrice(1)}>+1¢</button>
        </div>
      </div>

      {/* Shares */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...s.row, marginBottom: 4 }}>
          <span style={s.label}>Shares</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={s.shortcut} onClick={() => setShares(0)}>0</button>
            <button style={s.shortcut} onClick={() => setShares(Math.floor(shares * 0.8))}>20%</button>
            <button style={s.shortcut} onClick={() => setShares(Math.floor(shares * 0.5))}>50%</button>
            <button style={{ ...s.shortcut, color: '#818cf8' }}>Max</button>
          </div>
        </div>
        <div style={s.sharesInput}>
          <button style={s.adjBtn} onClick={() => adjustShares(-1000)}>-1k</button>
          <button style={s.adjBtn} onClick={() => adjustShares(-100)}>-100</button>
          <input type="number" value={shares} min={0} onChange={e => setShares(Math.max(0, parseInt(e.target.value)||0))}
            style={{ ...s.sharesVal, border: '1px solid #374151', outline: 'none' }} />
          <button style={{ ...s.adjBtn, color: '#818cf8' }} onClick={() => adjustShares(100)}>+100</button>
          <button style={{ ...s.adjBtn, color: '#818cf8' }} onClick={() => adjustShares(1000)}>+1k</button>
        </div>
      </div>

      <div style={s.divider} />

      {/* Details */}
      <details>
        <summary style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer', marginBottom: 6, listStyle: 'none' }}>▾ Details</summary>
        <div style={{ ...s.totalRow }}><span style={{ color: '#6b7280' }}>Total</span><span style={{ color: '#f9fafb', fontWeight: 500 }}>${total.toFixed(2)}</span></div>
        <div style={{ ...s.totalRow }}><span style={{ color: '#6b7280' }}>Return</span><span style={{ color: ret >= 0 ? '#4ade80' : '#f87171', fontWeight: 500 }}>${ret.toFixed(2)} ({retPct}%)</span></div>
      </details>

      {status === 'error' && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '6px 10px', borderRadius: 6, margin: '8px 0' }}>{errMsg}</div>}
      {status === 'done' && <div style={{ fontSize: 12, color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '6px 10px', borderRadius: 6, margin: '8px 0' }}>Order submitted! ID: {orderId}</div>}

      <button onClick={handleTrade} disabled={['signing','submitting'].includes(status)}
        style={{ ...s.connectBtn,
          background: ['signing','submitting'].includes(status) ? '#374151' : '#4f46e5',
          color: ['signing','submitting'].includes(status) ? '#6b7280' : '#fff' }}>
        {!authenticated ? 'Connect to Trade' : status === 'signing' ? 'Signing...' : status === 'submitting' ? 'Submitting...' : shares === 0 ? 'Enter Amount' : `${mode === 'buy' ? 'Buy' : 'Sell'} ${outcome}`}
      </button>
    </div>
  );
}

// ── Order Book (center column) ─────────────────────────────────────────────────
function OrderBook({ books, tokens }: { books: (Book | null)[], tokens: Token[] }) {
  const [side, setSide] = useState<'yes'|'no'>('yes');
  const book = books[side === 'yes' ? 0 : 1];
  const asks = (book?.asks || []).slice(0, 8).reverse();
  const bids = (book?.bids || []).slice(0, 8);
  const midPrice = tokens.find(t => t.outcome === (side === 'yes' ? 'Yes' : 'No'))?.price;
  const mid = midPrice ? Math.round(parseFloat(midPrice) * 1000) / 10 : 50;

  return (
    <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #1f2937' }}>
        <button onClick={() => setSide('yes')} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: side === 'yes' ? 'rgba(34,197,94,0.15)' : 'transparent', color: side === 'yes' ? '#4ade80' : '#6b7280' }}>Trade Yes</button>
        <button onClick={() => setSide('no')} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: side === 'no' ? 'rgba(239,68,68,0.15)' : 'transparent', color: side === 'no' ? '#f87171' : '#6b7280' }}>Trade No</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '6px 12px', fontSize: 11, color: '#4b5563', borderBottom: '1px solid #111827' }}>
        <span>Price</span><span style={{ textAlign: 'center' }}>Shares</span><span style={{ textAlign: 'right' }}>Total</span>
      </div>
      {/* Asks (red - sell orders above mid) */}
      {asks.map((a, i) => {
        const p = parseFloat(a.price) * 100;
        const sz = parseFloat(a.size);
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '3px 12px', fontSize: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min((sz/10000)*100, 100)}%`, background: 'rgba(239,68,68,0.08)' }} />
            <span style={{ color: '#f87171', fontWeight: 500, position: 'relative' }}>{p.toFixed(1)}¢</span>
            <span style={{ textAlign: 'center', color: '#9ca3af', position: 'relative' }}>{sz.toFixed(0)}</span>
            <span style={{ textAlign: 'right', color: '#6b7280', position: 'relative' }}>${(p * sz / 100).toFixed(0)}</span>
          </div>
        );
      })}
      {/* Mid price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '5px 12px', background: '#111827', fontSize: 12 }}>
        <span style={{ color: '#818cf8', fontWeight: 700 }}>{mid.toFixed(1)}¢</span>
        <span style={{ textAlign: 'center', color: '#4b5563', fontSize: 10 }}>mid · 0.1¢</span>
        <span />
      </div>
      {/* Bids (green - buy orders below mid) */}
      {bids.map((b, i) => {
        const p = parseFloat(b.price) * 100;
        const sz = parseFloat(b.size);
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '3px 12px', fontSize: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min((sz/10000)*100, 100)}%`, background: 'rgba(34,197,94,0.08)' }} />
            <span style={{ color: '#4ade80', fontWeight: 500, position: 'relative' }}>{p.toFixed(1)}¢</span>
            <span style={{ textAlign: 'center', color: '#9ca3af', position: 'relative' }}>{sz.toFixed(0)}</span>
            <span style={{ textAlign: 'right', color: '#6b7280', position: 'relative' }}>${(p * sz / 100).toFixed(0)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Trades ──────────────────────────────────────────────────────────────
function RecentTrades({ trades }: { trades: Trade[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '6px 12px', fontSize: 11, color: '#4b5563', borderBottom: '1px solid #1f2937' }}>
        <span>User</span><span>Outcome</span><span style={{ textAlign: 'right' }}>Shares</span><span style={{ textAlign: 'right' }}>Time</span>
      </div>
      {trades.slice(0, 10).map((t, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '5px 12px', fontSize: 12, borderBottom: '1px solid #0d1117' }}>
          <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.name || t.pseudonym || (t.proxyWallet ? t.proxyWallet.slice(0,6)+'...' : 'anon')}
          </span>
          <span style={{ color: t.outcome === 'Yes' ? '#4ade80' : '#f87171' }}>{t.outcome}</span>
          <span style={{ textAlign: 'right', color: '#9ca3af' }}>{Number(t.size).toLocaleString()}</span>
          <span style={{ textAlign: 'right', color: '#4b5563' }}>{timeAgo(t.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Market Page ───────────────────────────────────────────────────────────
export default function MarketPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [data, setData] = useState<{ market: Market; books: (Book|null)[]; recentTrades: Trade[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/market?slug=${slug}`);
      if (!res.ok) { setError('Market not found'); return; }
      const d = await res.json();
      setData(d);
      setError('');
    } catch { setError('Failed to load market'); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000); // refresh every 5s
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#4b5563', fontSize: 14 }}>Loading market...</div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f87171', fontSize: 14 }}>{error || 'Market not found'}</div>
    </div>
  );

  const { market, books, recentTrades } = data;
  const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
  const noToken = market.tokens?.find(t => t.outcome === 'No');
  const yesP = Math.round(parseFloat(yesToken?.price || '0.5') * 1000) / 10;
  const noP = Math.round(parseFloat(noToken?.price || '0.5') * 1000) / 10;
  const vol = parseFloat(String(market.volumeNum || market.volume || 0));
  const vol24 = market.volume24hr || 0;
  const tags = market.tags || [];

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f9fafb', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(3,7,18,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #111827' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: 'white' }}>B</div>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.5px' }}>BETG8</span>
            </button>
            <span style={{ color: '#374151', fontSize: 14 }}>›</span>
            <span style={{ fontSize: 13, color: '#6b7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{market.question}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {authenticated ? (
              <span style={{ fontSize: 12, color: '#6b7280', background: '#111827', border: '1px solid #1f2937', padding: '5px 10px', borderRadius: 6 }}>
                {wallets[0]?.address?.slice(0,6)}...{wallets[0]?.address?.slice(-4)}
              </span>
            ) : (
              <button onClick={login} style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8 }}>Connect</button>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1rem 1.25rem' }}>
        {/* Market header */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16, padding: '0.875rem', background: '#0d1117', borderRadius: 10 }}>
          {(market.image || market.icon) && (
            <img src={market.image || market.icon} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: '0 0 6px', lineHeight: 1.3 }}>{market.question}</h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', flexWrap: 'wrap', marginBottom: 8 }}>
              {vol > 0 && <span><strong style={{ color: '#9ca3af' }}>{fmtVol(vol)}</strong> Vol</span>}
              {vol24 > 0 && <span><strong style={{ color: '#9ca3af' }}>{fmtVol(vol24)}</strong> 24h</span>}
              {market.end_date_iso && (
                <span>⏱ {Math.max(0, Math.floor((new Date(market.end_date_iso).getTime() - Date.now()) / 86400000))}d left</span>
              )}
              <span>📅 {market.end_date_iso ? new Date(market.end_date_iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map(tag => (
                <span key={tag.slug} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 10, background: '#1f2937', color: '#9ca3af' }}>{tag.label}</span>
              ))}
            </div>
          </div>
          {/* Outcome pills */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '6px 14px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>Yes {yesP}%</span>
            <span style={{ padding: '6px 14px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>No {noP}%</span>
          </div>
        </div>

        {/* 3-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px 300px', gap: 14 }}>
          {/* Left — chart placeholder + description + trades */}
          <div>
            {/* Price bar */}
            <div style={{ background: '#0d1117', borderRadius: 10, padding: '1rem', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['1H','6H','1D','1W','1M','ALL'].map(t => (
                  <button key={t} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #1f2937', background: t==='1M'?'#1f2937':'transparent', color: t==='1M'?'#f9fafb':'#6b7280' }}>{t}</button>
                ))}
              </div>
              {/* Simple price visualization */}
              <div style={{ height: 160, background: '#030712', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <svg viewBox="0 0 400 160" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`M0,${160*(1-yesP/100)} Q100,${160*(1-yesP/100)*0.8} 200,${160*(1-yesP/100)*0.9} Q300,${160*(1-yesP/100)*1.05} 400,${160*(1-yesP/100)}`}
                    fill="none" stroke="#4ade80" strokeWidth="2" />
                  <path d={`M0,${160*(1-yesP/100)} Q100,${160*(1-yesP/100)*0.8} 200,${160*(1-yesP/100)*0.9} Q300,${160*(1-yesP/100)*1.05} 400,${160*(1-yesP/100)} L400,160 L0,160 Z`}
                    fill="url(#priceGrad)" />
                </svg>
                <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 20, fontWeight: 700, color: '#4ade80' }}>{yesP}¢</div>
                <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 11, color: '#4b5563' }}>Yes price</div>
              </div>
            </div>

            {/* Description */}
            {market.description && (
              <div style={{ background: '#0d1117', borderRadius: 10, padding: '1rem', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>Market Rules</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, maxHeight: 120, overflow: 'hidden' }}>
                  {market.description.slice(0, 400)}{market.description.length > 400 ? '...' : ''}
                </div>
              </div>
            )}

            {/* Recent trades */}
            {recentTrades.length > 0 && (
              <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #1f2937' }}>Recent Activity</div>
                <RecentTrades trades={recentTrades} />
              </div>
            )}
          </div>

          {/* Center — Order Book */}
          <div>
            <OrderBook books={books} tokens={market.tokens || []} />
          </div>

          {/* Right — Trade Panel */}
          <div>
            <TradePanel market={market} />
          </div>
        </div>
      </div>
    </div>
  );
}
