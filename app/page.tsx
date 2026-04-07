'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MarketToken { token_id: string; outcome: string; price: string; }
interface Market {
  condition_id: string; question: string; groupItemTitle?: string; slug: string;
  volume?: number; liquidity?: number; image?: string; tokens?: MarketToken[];
  active?: boolean; restricted?: boolean; endDate?: string;
}
interface EventOutcome { outcome: string; price: number; token_id?: string; }
interface EventItem {
  id?: string; title: string; slug: string; image?: string;
  volume?: number; volume24h?: number; numMarkets?: number; endDate?: string;
  tags?: string[]; category?: string; _outcomes?: EventOutcome[]; markets?: Market[];
}

const CATEGORIES = ['Trending','Politics','Sports','Crypto','Finance','Geopolitics','Earnings','Tech','Culture','World','Economy','Elections','Mentions'];

function fmtVol(v: number) {
  if (!v || isNaN(v)) return '$0';
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Right Panel: Market Detail ─────────────────────────────────────────────────
function MarketPanel({ event, market, onClose }: { event: EventItem | null; market: Market | null; onClose: () => void }) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [outcome, setOutcome] = useState<'Yes'|'No'>('Yes');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle'|'signing'|'submitting'|'done'|'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [books, setBooks] = useState<{ bids: {price:string;size:string}[]; asks: {price:string;size:string}[] } | null>(null);

  const yesToken = market?.tokens?.find(t => t.outcome === 'Yes');
  const noToken = market?.tokens?.find(t => t.outcome === 'No');
  const yesP = parseFloat(yesToken?.price || '0.5') * 100;
  const noP = parseFloat(noToken?.price || '0.5') * 100;
  const activeToken = outcome === 'Yes' ? yesToken : noToken;
  const activePrice = (outcome === 'Yes' ? yesP : noP) / 100;
  const shares = amount ? (parseFloat(amount) / activePrice).toFixed(2) : '0';
  const payout = amount ? parseFloat(amount) / activePrice : 0;
  const profit = amount ? payout - parseFloat(amount) : 0;

  // Fetch order book
  useEffect(() => {
    if (!activeToken?.token_id) return;
    const fetchBook = async () => {
      try {
        const res = await fetch(`https://clob.polymarket.com/book?token_id=${activeToken.token_id}`);
        if (res.ok) setBooks(await res.json());
      } catch { /* ignore */ }
    };
    fetchBook();
    const t = setInterval(fetchBook, 5000);
    return () => clearInterval(t);
  }, [activeToken?.token_id]);

  const handleTrade = async () => {
    if (!authenticated) { login(); return; }
    if (!market || !activeToken || !amount || parseFloat(amount) <= 0) return;
    const wallet = wallets[0];
    if (!wallet) return;
    setStatus('signing'); setErrMsg('');
    try {
      const provider = await wallet.getEthereumProvider();
      const size = parseFloat(amount);
      const makerAmount = Math.round(size * 1e6).toString();
      const takerAmount = Math.round(payout * 1e6).toString();
      // Only EOA wallets (MetaMask) work directly with Polymarket
      // Privy embedded wallets need Polymarket proxy registration
      // Determine signature type and addresses
      // Privy embedded wallet = signatureType 1 (POLY_PROXY)
      // MetaMask/EOA = signatureType 0
      const isEmbedded = wallet.walletClientType === 'privy';
      const signatureType = isEmbedded ? 1 : 0;

      // For proxy wallets (signatureType 1), derive proxy address via CREATE2
      // maker = proxy wallet address (holds funds on Polymarket)
      // signer = EOA address (signs the order)
      let makerAddress = wallet.address;
      if (isEmbedded) {
        const { ethers } = await import('ethers');
        const PROXY_FACTORY = '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052';
        const PROXY_INIT_CODE_HASH = '0x7359d5a6f2bf43e3b46a7a1c88d6d1dea8d52f7c37d77d40b8c70c0cbb5a5e22';
        const salt = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [wallet.address]));
        makerAddress = ethers.utils.getCreate2Address(PROXY_FACTORY, salt, PROXY_INIT_CODE_HASH);
      }

      const orderParams = {
        salt: Math.floor(Math.random() * 1e15).toString(),
        maker: makerAddress,   // proxy wallet for Privy, EOA for MetaMask
        signer: wallet.address, // always the EOA that signs
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: activeToken.token_id,
        makerAmount, takerAmount, expiration: '0', nonce: '0',
        feeRateBps: '50', side: 0, signatureType,
      };
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
      if (d.success || d.orderId) { setStatus('done'); setAmount(''); }
      else { setErrMsg(d.error || 'Failed'); setStatus('error'); }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrMsg(err?.message?.slice(0,80) || 'Error');
      setStatus('error');
    }
  };

  if (!market || !event) return (
    <div style={{ flex: '0 0 380px', background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 14 }}>Select a market to trade</div>
      </div>
    </div>
  );

  const asks = (books?.asks || []).slice(0, 5).reverse();
  const bids = (books?.bids || []).slice(0, 5);

  return (
    <div style={{ flex: '0 0 380px', background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {event.image && <img src={event.image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4, marginBottom: 4 }}>{market.question || event.title}</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#6b7280', flexWrap: 'wrap' }}>
            {market.volume ? <span>Vol: {fmtVol(market.volume)}</span> : null}
            {market.endDate ? <span>Ends {new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {/* Order book */}
        {books && (
          <div style={{ marginBottom: 14, background: '#f9fafb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 11, fontWeight: 500, color: '#9ca3af', padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>
              <span>Price</span><span style={{ textAlign: 'right' }}>Shares</span>
            </div>
            {asks.map((a, i) => {
              const p = parseFloat(a.price) * 100;
              return <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '3px 10px', fontSize: 12 }}>
                <span style={{ color: '#ef4444' }}>{p.toFixed(1)}¢</span>
                <span style={{ textAlign: 'right', color: '#6b7280' }}>{parseFloat(a.size).toFixed(0)}</span>
              </div>;
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '4px 10px', background: '#f3f4f6', fontSize: 12 }}>
              <span style={{ color: '#4f46e5', fontWeight: 700 }}>{(outcome === 'Yes' ? yesP : noP).toFixed(1)}¢</span>
              <span style={{ textAlign: 'right', color: '#9ca3af', fontSize: 10 }}>mid</span>
            </div>
            {bids.map((b, i) => {
              const p = parseFloat(b.price) * 100;
              return <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '3px 10px', fontSize: 12 }}>
                <span style={{ color: '#22c55e' }}>{p.toFixed(1)}¢</span>
                <span style={{ textAlign: 'right', color: '#6b7280' }}>{parseFloat(b.size).toFixed(0)}</span>
              </div>;
            })}
          </div>
        )}

        {/* Yes/No toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setOutcome('Yes')} style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none', background: outcome === 'Yes' ? '#22c55e' : '#f0fdf4', color: outcome === 'Yes' ? '#fff' : '#16a34a', textAlign: 'center' }}>
            Yes {yesP.toFixed(1)}%
          </button>
          <button onClick={() => setOutcome('No')} style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none', background: outcome === 'No' ? '#ef4444' : '#fef2f2', color: outcome === 'No' ? '#fff' : '#dc2626', textAlign: 'center' }}>
            No {noP.toFixed(1)}%
          </button>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, fontWeight: 500 }}>Amount (USDC)</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>$</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="1" placeholder="0.00"
              style={{ width: '100%', padding: '10px 12px 10px 24px', fontSize: 15, fontWeight: 600, borderRadius: 8, border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{ flex: 1, padding: '4px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: amount === String(v) ? '#4f46e5' : '#fff', color: amount === String(v) ? '#fff' : '#6b7280' }}>${v}</button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#6b7280' }}>Shares</span><span style={{ fontWeight: 600 }}>{shares}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#6b7280' }}>Avg price</span><span style={{ fontWeight: 600 }}>{(activePrice * 100).toFixed(1)}¢</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#6b7280' }}>Potential profit</span><span style={{ fontWeight: 600, color: '#16a34a' }}>+${profit > 0 ? profit.toFixed(2) : '0.00'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: 4, marginTop: 4 }}><span style={{ color: '#9ca3af', fontSize: 11 }}>Fee (0.5%)</span><span style={{ color: '#9ca3af', fontSize: 11 }}>${amount ? (parseFloat(amount) * 0.005).toFixed(3) : '0.000'}</span></div>
        </div>

        {status === 'error' && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>{errMsg}</div>}
        {status === 'done' && <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>Order submitted! ✓</div>}

        <button onClick={handleTrade} disabled={['signing','submitting'].includes(status) || !amount || parseFloat(amount) <= 0}
          style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, borderRadius: 10, cursor: 'pointer', border: 'none', background: (!amount || parseFloat(amount) <= 0) || ['signing','submitting'].includes(status) ? '#e5e7eb' : '#4f46e5', color: (!amount || parseFloat(amount) <= 0) ? '#9ca3af' : '#fff' }}>
          {!authenticated ? 'Connect to Trade' : status === 'signing' ? 'Sign in wallet...' : status === 'submitting' ? 'Submitting...' : !amount || parseFloat(amount) <= 0 ? 'Enter Amount' : `Buy ${outcome} — $${amount}`}
        </button>
      </div>
    </div>
  );
}

// ── Event Row (center column) ─────────────────────────────────────────────────
function EventRow({ event, selectedMarket, onSelectMarket }: {
  event: EventItem; selectedMarket: Market | null; onSelectMarket: (e: EventItem, m: Market) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const outcomes = event._outcomes || [];
  const isBinary = outcomes.length <= 2 && outcomes.some(o => o.outcome === 'Yes' || o.outcome === 'No');
  const markets = event.markets || [];
  const showMoreBtn = markets.length > 3;

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      {/* Event header row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 10, cursor: 'pointer', background: '#fafafa' }}
        onClick={() => setExpanded(!expanded)}>
        {event.image && <img src={event.image} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', gap: 10, marginTop: 2 }}>
            <span>{fmtVol(event.volume || 0)} Vol</span>
            <span>{event.numMarkets} {event.numMarkets === 1 ? 'market' : 'markets'}</span>
            {event.endDate ? <span>Ends {new Date(event.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Markets list */}
      {(expanded || !isBinary) && markets.slice(0, expanded || !showMoreBtn ? undefined : 3).map(m => {
        const yes = m.tokens?.find(t => t.outcome === 'Yes');
        const no = m.tokens?.find(t => t.outcome === 'No');
        const yesP = parseFloat(yes?.price || '0.5') * 100;
        const noP = parseFloat(no?.price || '0.5') * 100;
        const isSelected = selectedMarket?.condition_id === m.condition_id;

        return (
          <div key={m.condition_id} onClick={() => onSelectMarket(event, m)}
            style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px 58px', cursor: 'pointer', background: isSelected ? '#eef2ff' : 'transparent', borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent' }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <div style={{ flex: 1, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.groupItemTitle || m.question}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
                {yesP.toFixed(1)}%
              </span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
                {noP.toFixed(1)}%
              </span>
              {m.volume ? <span style={{ color: '#9ca3af', fontSize: 11, alignSelf: 'center' }}>{fmtVol(m.volume)}</span> : null}
            </div>
          </div>
        );
      })}

      {/* Binary: show Yes/No inline */}
      {!expanded && isBinary && markets.length === 1 && (() => {
        const m = markets[0];
        const yes = m.tokens?.find(t => t.outcome === 'Yes');
        const no = m.tokens?.find(t => t.outcome === 'No');
        const yesP = parseFloat(yes?.price || '0.5') * 100;
        const noP = parseFloat(no?.price || '0.5') * 100;
        const isSelected = selectedMarket?.condition_id === m.condition_id;
        return (
          <div onClick={() => onSelectMarket(event, m)}
            style={{ display: 'flex', alignItems: 'center', padding: '6px 16px 8px 58px', cursor: 'pointer', background: isSelected ? '#eef2ff' : 'transparent', borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent' }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden', width: '80%' }}>
                <div style={{ height: 4, width: `${yesP}%`, background: '#4f46e5', borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600 }}>Yes {yesP.toFixed(1)}%</span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>No {noP.toFixed(1)}%</span>
            </div>
          </div>
        );
      })()}

      {/* Show more */}
      {!expanded && showMoreBtn && (
        <div onClick={() => setExpanded(true)} style={{ padding: '4px 16px 8px 58px', fontSize: 11, color: '#4f46e5', cursor: 'pointer' }}>
          +{markets.length - 3} more markets
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState('idle');
  const [category, setCategory] = useState('Trending');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const fetchedCats = useRef(new Set<string>());
  const cacheRef = useRef<Record<string, EventItem[]>>({});

  // Fetch balance from Polygon
  useEffect(() => {
    const wallet = wallets[0];
    if (!wallet?.address) return;
    const fetchBal = async () => {
      try {
        const res = await fetch(`https://polygon-bor-rpc.publicnode.com`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', data: `0x70a08231000000000000000000000000${wallet.address.slice(2)}` }, 'latest'], id: 1 }),
        });
        const d = await res.json();
        if (d.result && d.result !== '0x') {
          const raw = parseInt(d.result, 16);
          setBalance((raw / 1e6).toFixed(2));
        }
      } catch { /* ignore */ }
    };
    fetchBal();
    const t = setInterval(fetchBal, 30000);
    return () => clearInterval(t);
  }, [wallets]);

  const fetchCategory = useCallback(async (cat: string) => {
    if (fetchedCats.current.has(cat) && cacheRef.current[cat]) {
      setEvents(cacheRef.current[cat]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/events?tag=${cat}`);
      const data = await res.json();
      cacheRef.current[cat] = data.events || [];
      fetchedCats.current.add(cat);
      setEvents(data.events || []);
      setAllEvents(prev => {
        const merged = [...prev, ...(data.events || [])];
        const seen = new Set<string>();
        return merged.filter(e => { const k = e.slug; if (seen.has(k)) return false; seen.add(k); return true; });
      });
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategory(category); }, [category, fetchCategory]);

  const filtered = search.trim()
    ? allEvents.filter(e => e.title.toLowerCase().includes(search.toLowerCase()))
    : events;

  const walletAddr = wallets[0]?.address;

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
    } catch { setWithdrawStatus('idle'); setShowWithdrawModal(false); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Deposit Modal - rendered via portal to avoid overflow:hidden issues */}
      {showDepositModal && typeof document !== 'undefined' && createPortal((
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => e.target === e.currentTarget && setShowDepositModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 420, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Add Funds</div>
              <button onClick={() => setShowDepositModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Send USDC to your Polygon wallet to start trading</div>
            <a href={`https://buy.moonpay.com?walletAddress=${walletAddr}&currencyCode=usdc_polygon`} target="_blank" rel="noreferrer"
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
                <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' as const }}>{walletAddr}</code>
                <button onClick={() => navigator.clipboard.writeText(walletAddr || '')} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const }}>Copy</button>
              </div>
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>⚠️ Send only USDC on Polygon network</div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' as const }}>Current balance: <strong>{balance ?? '0'} USDC</strong></div>
          </div>
        </div>
      ), document.body)}
      {showWithdrawModal && typeof document !== 'undefined' && createPortal((
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => e.target === e.currentTarget && setShowWithdrawModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 380, maxWidth: '90vw' }}>
            {withdrawStatus === 'done' ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Sent!</div>
                <button onClick={() => setShowWithdrawModal(false)} style={{ padding: '8px 24px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Withdraw USDC</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Send USDC from your Polygon wallet</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Amount (USDC)</div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>$</span>
                  <input type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} placeholder="0.00" min="0"
                    style={{ width: '100%', padding: '10px 10px 10px 24px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {[25,50,75,100].map(pct => {
                    const bal = parseFloat(balance || '0');
                    return <button key={pct} onClick={() => setWithdrawAmt((bal * pct / 100).toFixed(2))}
                      style={{ flex: 1, padding: '4px', fontSize: 11, borderRadius: 5, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>{pct}%</button>;
                  })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Destination Address</div>
                <input value={withdrawAddr} onChange={e => setWithdrawAddr(e.target.value)} placeholder="0x..."
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace', marginBottom: 14 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowWithdrawModal(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                  <button onClick={handleWithdraw} disabled={withdrawStatus === 'pending' || !withdrawAddr || !withdrawAmt}
                    style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: !withdrawAddr || !withdrawAmt ? '#e5e7eb' : '#111827', color: !withdrawAddr || !withdrawAmt ? '#9ca3af' : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                    {withdrawStatus === 'pending' ? 'Confirm in wallet...' : `Withdraw $${withdrawAmt || '0'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ), document.body)}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left Sidebar ── */}
        <div style={{ width: 240, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* Logo */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'white', flexShrink: 0 }}>B</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Betg8</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>Prediction markets</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markets"
                style={{ width: '100%', padding: '7px 8px 7px 26px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }} />
            </div>
          </div>

          {/* User section */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
            {ready && authenticated ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>BALANCE</div>
                  <button onClick={logout} style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>${balance ?? '--'} <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>USDC</span></div>
                {walletAddr && <div style={{ fontSize: 11, color: '#9ca3af' }}>{walletAddr.slice(0,8)}...{walletAddr.slice(-6)}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { setWithdrawAddr(''); setWithdrawAmt(''); setWithdrawStatus('idle'); setShowWithdrawModal(true); }} style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>Withdraw</button>
                  <button onClick={() => setShowDepositModal(true)} style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' }}>Add Fund</button>
                </div>
                <button onClick={() => router.push('/portfolio')} style={{ width: '100%', padding: '6px', fontSize: 11, borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', marginTop: 6 }}>Portfolio</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Sign in to trade</div>
                <button onClick={login} style={{ width: '100%', padding: '8px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#4f46e5', color: '#fff' }}>Connect →</button>
              </div>
            )}
          </div>

          {/* Categories */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.5px' }}>CATEGORIES</div>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { setCategory(cat); setSearch(''); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', fontSize: 13, cursor: 'pointer', border: 'none', background: category === cat ? '#eef2ff' : 'transparent', color: category === cat ? '#4f46e5' : '#374151', fontWeight: category === cat ? 600 : 400, textAlign: 'left' }}>
                <span>{cat}</span>
                {fetchedCats.current.has(cat) && cacheRef.current[cat] && (
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{cacheRef.current[cat].length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Bottom balance bar (like Polymtrade) */}
          {authenticated && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{balance ?? '--'} USDC</span>
              {walletAddr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>G</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{walletAddr.slice(0,6)}...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Center: Event List ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Subheader */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{search ? `Search: "${search}"` : category}</span>
            {!loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>• {filtered.length} markets</span>}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, marginBottom: 6, width: '60%' }} />
                  <div style={{ height: 10, background: '#f3f4f6', borderRadius: 4, width: '40%' }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>No markets found</div>
            ) : (
              filtered.map((e, i) => (
                <EventRow key={String(e.id || e.slug || i)} event={e}
                  selectedMarket={selectedEvent?.slug === e.slug ? selectedMarket : null}
                  onSelectMarket={(ev, m) => { setSelectedEvent(ev); setSelectedMarket(m); }} />
              ))
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <MarketPanel event={selectedEvent} market={selectedMarket} onClose={() => { setSelectedEvent(null); setSelectedMarket(null); }} />
      </div>
    </div>
  );
}
