'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { buildOrderParams } from '@/lib/polymarket-live';

interface Token { token_id: string; outcome: string; price: string; }
interface Market { condition_id: string; question: string; slug: string; groupItemTitle?: string; endDate?: string; volume?: number; liquidity?: number; image?: string; tokens?: Token[]; restricted?: boolean; }
interface Book { bids: { price: string; size: string }[]; asks: { price: string; size: string }[]; }
interface Trade { size: number; price: number; outcome: string; name?: string; pseudonym?: string; proxyWallet?: string; timestamp: number; }

function fmtVol(v: number) {
  if (!v) return '$0';
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h`;
}

// ── Order Book ─────────────────────────────────────────────────────────────────
function OrderBook({ books, tokens, onSideChange }: { books: (Book|null)[]; tokens: Token[]; onSideChange: (side: 'yes'|'no') => void }) {
  const [side, setSide] = useState<'yes'|'no'>('yes');
  const book = books[side === 'yes' ? 0 : 1];
  const asks = (book?.asks || []).slice(0, 7).reverse();
  const bids = (book?.bids || []).slice(0, 7);
  const token = tokens.find(t => t.outcome === (side === 'yes' ? 'Yes' : 'No'));
  const mid = token ? parseFloat(token.price) * 100 : 50;

  const handleSide = (s: 'yes'|'no') => { setSide(s); onSideChange(s); };

  return (
    <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex' }}>
        <button onClick={() => handleSide('yes')} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: side === 'yes' ? 'rgba(34,197,94,0.15)' : 'transparent', color: side === 'yes' ? '#4ade80' : '#6b7280', borderBottom: `2px solid ${side === 'yes' ? '#22c55e' : 'transparent'}` }}>Trade Yes</button>
        <button onClick={() => handleSide('no')} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: side === 'no' ? 'rgba(239,68,68,0.15)' : 'transparent', color: side === 'no' ? '#f87171' : '#6b7280', borderBottom: `2px solid ${side === 'no' ? '#ef4444' : 'transparent'}` }}>Trade No</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '5px 10px', fontSize: 10, color: '#4b5563', borderBottom: '1px solid #111827' }}>
        <span>Price</span><span style={{ textAlign: 'center' }}>Shares</span><span style={{ textAlign: 'right' }}>Total</span>
      </div>
      {asks.map((a, i) => {
        const p = parseFloat(a.price) * 100; const sz = parseFloat(a.size);
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '3px 10px', fontSize: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min(sz/50000*100,100)}%`, background: 'rgba(239,68,68,0.07)' }} />
            <span style={{ color: '#f87171', fontWeight: 500, position: 'relative' }}>{p.toFixed(1)}¢</span>
            <span style={{ textAlign: 'center', color: '#9ca3af', position: 'relative' }}>{sz.toFixed(0)}</span>
            <span style={{ textAlign: 'right', color: '#6b7280', position: 'relative', fontSize: 11 }}>${(p*sz/100).toFixed(0)}</span>
          </div>
        );
      })}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '4px 10px', background: '#111827', fontSize: 12 }}>
        <span style={{ color: '#818cf8', fontWeight: 700 }}>{mid.toFixed(1)}¢</span>
        <span style={{ textAlign: 'center', color: '#4b5563', fontSize: 10 }}>mid</span><span />
      </div>
      {bids.map((b, i) => {
        const p = parseFloat(b.price) * 100; const sz = parseFloat(b.size);
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '3px 10px', fontSize: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min(sz/50000*100,100)}%`, background: 'rgba(34,197,94,0.07)' }} />
            <span style={{ color: '#4ade80', fontWeight: 500, position: 'relative' }}>{p.toFixed(1)}¢</span>
            <span style={{ textAlign: 'center', color: '#9ca3af', position: 'relative' }}>{sz.toFixed(0)}</span>
            <span style={{ textAlign: 'right', color: '#6b7280', position: 'relative', fontSize: 11 }}>${(p*sz/100).toFixed(0)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Trade Panel ────────────────────────────────────────────────────────────────
function TradePanel({ market, activeSide, isGeoblocked }: { market: Market | null; activeSide: 'yes'|'no'; isGeoblocked: boolean }) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const [mode, setMode] = useState<'buy'|'sell'>('buy');
  const [outcome, setOutcome] = useState<'Yes'|'No'>(activeSide === 'yes' ? 'Yes' : 'No');
  const [shares, setShares] = useState(0);
  const [status, setStatus] = useState<'idle'|'signing'|'submitting'|'done'|'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [orderId, setOrderId] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);

  useEffect(() => { setOutcome(activeSide === 'yes' ? 'Yes' : 'No'); }, [activeSide]);

  const yesToken = market?.tokens?.find(t => t.outcome === 'Yes');
  const noToken = market?.tokens?.find(t => t.outcome === 'No');
  const yesP = parseFloat(yesToken?.price || '0.5') * 100;
  const noP = parseFloat(noToken?.price || '0.5') * 100;
  const activeToken = outcome === 'Yes' ? yesToken : noToken;
  const activePrice = outcome === 'Yes' ? yesP : noP;
  const total = shares * activePrice / 100;
  const payout = shares;
  const ret = payout - total;

  const handleDeposit = async () => {
    if (!authenticated) { login(); return; }
    const wallet = wallets[0];
    if (!wallet) return;
    try {
      await fundWallet({ address: wallet.address });
    } catch (e) {
      console.error('Fund wallet error:', e);
    }
  };

  const handleTrade = async () => {
    if (!authenticated) { login(); return; }
    if (!market || !activeToken || shares === 0) return;
    if (market.restricted) {
      setErrMsg('This market is not available for trading');
      setStatus('error');
      return;
    }
    const wallet = wallets[0];
    if (!wallet) return;
    setStatus('signing'); setErrMsg('');
    try {
      const provider = await wallet.getEthereumProvider();
      const orderParams = buildOrderParams({
        tokenId: activeToken.token_id,
        side: 'BUY',
        price: activePrice / 100,
        size: total,
        makerAddress: wallet.address,
      });
      const domain = { name: 'Polymarket CTF Exchange', version: '1', chainId: 137, verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' };
      const types = { Order: [
        {name:'salt',type:'uint256'},{name:'maker',type:'address'},{name:'signer',type:'address'},
        {name:'taker',type:'address'},{name:'tokenId',type:'uint256'},{name:'makerAmount',type:'uint256'},
        {name:'takerAmount',type:'uint256'},{name:'expiration',type:'uint256'},{name:'nonce',type:'uint256'},
        {name:'feeRateBps',type:'uint256'},{name:'side',type:'uint8'},{name:'signatureType',type:'uint8'},
      ]};
      const sig = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [wallet.address, JSON.stringify({ domain, types, primaryType: 'Order', message: orderParams })]
      });
      setStatus('submitting');
      // Send via server to bypass geoblock
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedOrder: { ...orderParams, signature: sig } }),
      });
      const d = await res.json();
      if (d.success || d.orderId) {
        setOrderId(d.orderId || 'submitted');
        setStatus('done');
        setShares(0);
      } else {
        setErrMsg(d.error || 'Order failed');
        setStatus('error');
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrMsg(err?.message?.includes('rejected') ? 'Cancelled' : err?.message?.slice(0,80) || 'Error');
      setStatus('error');
    }
  };

  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: '1rem', position: 'sticky', top: 60 }}>
      {status === 'done' ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>Order Submitted!</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>ID: {orderId}</div>
          <button onClick={() => setStatus('idle')} style={{ padding: '8px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Trade Again</button>
        </div>
      ) : (
        <>
          {/* Buy/Sell + Balance + Deposit */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', background: '#1f2937', borderRadius: 8, padding: 3 }}>
              {(['buy','sell'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#111827' : '#9ca3af' }}>
                  {m === 'buy' ? 'Buy' : 'Sell'}
                </button>
              ))}
            </div>
            <button onClick={handleDeposit} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #4f46e5', background: 'rgba(79,70,229,0.1)', color: '#818cf8' }}>
              + Deposit
            </button>
          </div>

          {/* Geoblock warning */}
          {isGeoblocked && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#f87171' }}>
              ⚠️ Trading may be restricted in your region. Orders are processed server-side.
            </div>
          )}

          {/* Market restricted */}
          {market?.restricted && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#fbbf24' }}>
              ⚠️ This market has geographic restrictions
            </div>
          )}

          {/* Yes/No */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setOutcome('Yes')} style={{ flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${outcome === 'Yes' ? '#22c55e' : 'rgba(34,197,94,0.2)'}`, background: outcome === 'Yes' ? '#22c55e' : 'rgba(34,197,94,0.08)', color: outcome === 'Yes' ? '#fff' : '#4ade80', fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
              Yes {yesP.toFixed(1)}¢
            </button>
            <button onClick={() => setOutcome('No')} style={{ flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${outcome === 'No' ? '#ef4444' : 'rgba(239,68,68,0.2)'}`, background: outcome === 'No' ? '#ef4444' : 'rgba(239,68,68,0.08)', color: outcome === 'No' ? '#fff' : '#f87171', fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
              No {noP.toFixed(1)}¢
            </button>
          </div>

          {/* Shares */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Shares</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
              {[100, 500, 1000, 5000].map(v => (
                <button key={v} onClick={() => setShares(v)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: `1px solid ${shares===v?'#4f46e5':'#374151'}`, background: shares===v?'rgba(79,70,229,0.15)':'#1f2937', color: shares===v?'#818cf8':'#9ca3af' }}>{v.toLocaleString()}</button>
              ))}
              <button onClick={() => setShares(0)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #374151', background: '#1f2937', color: '#6b7280' }}>Clear</button>
            </div>
            <input type="number" value={shares} min={0} onChange={e => setShares(Math.max(0, parseInt(e.target.value)||0))}
              style={{ width: '100%', padding: '8px 12px', fontSize: 15, fontWeight: 600, textAlign: 'center', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Details */}
          <div style={{ background: '#1f2937', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ color: '#6b7280' }}>Cost</span><span style={{ color: '#f9fafb', fontWeight: 500 }}>${total.toFixed(2)} USDC</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ color: '#6b7280' }}>Potential return</span><span style={{ color: '#4ade80', fontWeight: 500 }}>+${ret.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#374151' }}>Builder fee (0.5%)</span><span style={{ color: '#374151' }}>${(total * 0.005).toFixed(3)}</span></div>
          </div>

          {status === 'error' && (
            <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>{errMsg}</div>
          )}

          <button onClick={handleTrade} disabled={['signing','submitting'].includes(status)}
            style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 700, borderRadius: 10, cursor: shares===0?'not-allowed':'pointer', border: 'none', background: shares===0||['signing','submitting'].includes(status)?'#374151':'#4f46e5', color: shares===0||['signing','submitting'].includes(status)?'#6b7280':'#fff' }}>
            {!authenticated ? 'Connect to Trade' : status==='signing' ? 'Sign in wallet...' : status==='submitting' ? 'Submitting...' : shares===0 ? 'Enter Shares' : `${mode==='buy'?'Buy':'Sell'} ${outcome}`}
          </button>

          {/* Withdraw hint */}
          {authenticated && (
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#4b5563' }}>
              Withdraw: send USDC from your Polygon wallet to any exchange
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Event Page ─────────────────────────────────────────────────────────────────
export default function EventPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [data, setData] = useState<{ event: { title?: string; image?: string; volume?: number; tags?: { label: string }[]; markets: Market[] }; markets: Market[]; books: (Book|null)[]; recentTrades: Trade[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [books, setBooks] = useState<(Book|null)[]>([null, null]);
  const [activeSide, setActiveSide] = useState<'yes'|'no'>('yes');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isGeoblocked, setIsGeoblocked] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Check geoblock
  useEffect(() => {
    fetch('/api/order').then(r => r.json()).then(d => {
      setIsGeoblocked(d.blocked === true);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/event?slug=${slug}`);
      if (!res.ok) return;
      const d = await res.json();
      setData(d);
      if (d.markets?.length > 0 && !selectedMarket) {
        setSelectedMarket(d.markets[0]);
        setBooks(d.books || [null, null]);
        setTrades(d.recentTrades || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [slug, selectedMarket]);

  const fetchMarketData = useCallback(async (market: Market) => {
    try {
      const res = await fetch(`/api/event?slug=${slug}`);
      if (!res.ok) return;
      const d = await res.json();
      setBooks(d.books || [null, null]);
      setTrades(d.recentTrades || []);
    } catch { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => {
      if (selectedMarket) fetchMarketData(selectedMarket);
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData, fetchMarketData, selectedMarket]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>Loading...</div>
  );

  const event = data?.event;
  const markets = data?.markets || [];

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f9fafb', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(3,7,18,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #111827' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: 'white' }}>B</div>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#f9fafb' }}>BETG8</span>
            </button>
            <span style={{ color: '#374151' }}>›</span>
            <span style={{ fontSize: 13, color: '#6b7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event?.title}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
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

      {/* Event header */}
      <div style={{ borderBottom: '1px solid #111827', padding: '0.875rem 1.25rem', background: '#0d1117' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 14, alignItems: 'center' }}>
          {event?.image && <img src={event.image} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#f9fafb', margin: '0 0 4px' }}>{event?.title}</h1>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
              {event?.volume ? <span><strong style={{ color: '#9ca3af' }}>{fmtVol(event.volume)}</strong> Vol</span> : null}
              <span><strong style={{ color: '#9ca3af' }}>{markets.length}</strong> markets</span>
              {event?.tags?.map(t => <span key={t.label} style={{ padding: '1px 8px', background: '#1f2937', borderRadius: 10 }}>{t.label}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* 3-column */}
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: '300px 1fr 280px', gap: 12, padding: '1rem 1.25rem', alignItems: 'start' }}>

        {/* Left: Market list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
          {markets.map(m => {
            const yes = m.tokens?.find(t => t.outcome==='Yes');
            const yesP = parseFloat(yes?.price||'0.5') * 100;
            const isSelected = selectedMarket?.condition_id === m.condition_id;
            return (
              <div key={m.condition_id} onClick={() => { setSelectedMarket(m); fetchMarketData(m); }}
                style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: isSelected?'#1f2937':'#111827', border: `1px solid ${isSelected?'#4f46e5':'#1f2937'}`, transition: 'all 0.12s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1, lineHeight: 1.4 }}>{m.groupItemTitle || m.question}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: yesP > 70 ? '#4ade80' : yesP < 30 ? '#f87171' : '#9ca3af', flexShrink: 0 }}>{yesP.toFixed(1)}¢</span>
                </div>
                {m.volume ? <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>{fmtVol(m.volume)} · {m.liquidity ? 'Liq: '+fmtVol(m.liquidity) : ''}</div> : null}
              </div>
            );
          })}
        </div>

        {/* Center: Order book */}
        <div>
          {selectedMarket && (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8', padding: '0 0 8px', borderBottom: '1px solid #1f2937', marginBottom: 10 }}>
                {selectedMarket.question}
              </div>
              <OrderBook books={books} tokens={selectedMarket.tokens||[]} onSideChange={setActiveSide} />
            </>
          )}
        </div>

        {/* Right: Trade panel + activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TradePanel market={selectedMarket} activeSide={activeSide} isGeoblocked={isGeoblocked} />

          {trades.length > 0 && (
            <div style={{ background: '#0d1117', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #111827' }}>Activity</div>
              {trades.slice(0,15).map((t,i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 12px', borderBottom: '1px solid #0a0f1a', fontSize: 11 }}>
                  <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name||t.pseudonym||'anon'}</span>
                  <span style={{ color: t.outcome==='Yes'?'#4ade80':'#f87171', fontWeight: 600 }}>{t.outcome}</span>
                  <span style={{ color: '#9ca3af' }}>{Number(t.size).toLocaleString()}</span>
                  <span style={{ color: '#4b5563' }}>{timeAgo(t.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
