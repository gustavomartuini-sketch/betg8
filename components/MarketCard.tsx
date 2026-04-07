'use client';

import { useState } from 'react';
import { EnrichedMarket } from '@/types';
import { translations, Lang } from '@/lib/i18n';
import { formatVolume, formatInr } from '@/lib/currency';

interface Props {
  market: EnrichedMarket;
  lang: Lang;
  inrRate: number;
  onTrade: (market: EnrichedMarket, side: 'BUY' | 'SELL', tokenId: string, price: number) => void;
  isWalletConnected: boolean;
}

const categoryStyles: Record<string, { bg: string; color: string }> = {
  ipl: { bg: '#FFF0E6', color: '#FF6B00' },
  cricket: { bg: '#E6F4ED', color: '#046A38' },
  politics: { bg: '#E8EAF6', color: '#1A237E' },
  crypto: { bg: '#F3E5F5', color: '#6A1B9A' },
  other: { bg: '#F5F5F5', color: '#555' },
};

export function MarketCard({ market, lang, inrRate, onTrade, isWalletConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(10);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState(market.yesPrice);

  const t = translations[lang];
  const style = categoryStyles[market.category] || categoryStyles.other;
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = 100 - yesPercent;
  const inrAmount = Math.round(amount * inrRate);
  const endDate = market.endDate ? new Date(market.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
  const vol = formatVolume(market.volumeNum || market.volume || 0);

  const handleBuyYes = () => {
    if (!isWalletConnected) { alert(t.walletRequired); return; }
    onTrade(market, 'BUY', market.yesTokenId, orderType === 'market' ? market.yesPrice : limitPrice);
    setExpanded(false);
  };

  const handleBuyNo = () => {
    if (!isWalletConnected) { alert(t.walletRequired); return; }
    onTrade(market, 'BUY', market.noTokenId, orderType === 'market' ? market.noPrice : 1 - limitPrice);
    setExpanded(false);
  };

  const potentialPayoutYes = amount / market.yesPrice;
  const potentialPayoutNo = amount / market.noPrice;

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: `0.5px solid var(--color-border-tertiary)`,
      borderLeft: market.volumeNum > 1_000_000 ? '3px solid #FF6B00' : '0.5px solid var(--color-border-tertiary)',
      borderRadius: 12,
      padding: '1rem 1.25rem',
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '3px 8px',
          borderRadius: 10, background: style.bg, color: style.color,
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {market.category_label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {t.volume}: {vol}
        </span>
      </div>

      {/* Question */}
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
        {market.question}
      </div>
      {lang === 'hi' && market.hindi_question && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          {market.hindi_question}
        </div>
      )}

      {/* Probability bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--color-background-secondary)', borderRadius: 2 }}>
          <div style={{ height: 4, width: `${yesPercent}%`, background: '#046A38', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, color: '#046A38', fontWeight: 500, minWidth: 28 }}>{yesPercent}%</span>
      </div>

      {/* Outcome buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => { setExpanded(e => !e); }}
          style={{
            flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
            border: '0.5px solid #046A38', color: '#046A38', background: 'transparent', textAlign: 'center',
          }}
        >
          {t.yes}
          <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>
            {yesPercent}¢ · {formatInr(Math.round(market.yesPrice * inrRate))}
          </div>
        </button>
        <button
          onClick={() => { setExpanded(e => !e); }}
          style={{
            flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
            border: '0.5px solid #c0392b', color: '#c0392b', background: 'transparent', textAlign: 'center',
          }}
        >
          {t.no}
          <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>
            {noPercent}¢ · {formatInr(Math.round(market.noPrice * inrRate))}
          </div>
        </button>
      </div>

      {/* Trade panel */}
      {expanded && (
        <div style={{
          background: 'var(--color-background-secondary)', borderRadius: 8,
          padding: '0.875rem', marginBottom: 10,
        }}>
          {/* Order type */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['market', 'limit'] as const).map(type => (
              <button key={type} onClick={() => setOrderType(type)} style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                border: '0.5px solid var(--color-border-secondary)',
                background: orderType === type ? 'var(--color-background-primary)' : 'transparent',
                color: orderType === type ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontWeight: orderType === type ? 500 : 400,
              }}>
                {type === 'market' ? t.marketOrder : t.limitOrder}
              </button>
            ))}
          </div>

          {/* Amount row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 70 }}>{t.amount}</label>
            <input
              type="number" value={amount} min={5} step={1}
              onChange={e => setAmount(Math.max(5, Number(e.target.value)))}
              style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 8,
                border: '0.5px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', minWidth: 60 }}>
              ≈ {formatInr(inrAmount)}
            </span>
          </div>

          {/* Limit price row */}
          {orderType === 'limit' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 70 }}>{t.price}</label>
              <input
                type="number" value={limitPrice} min={0.01} max={0.99} step={0.01}
                onChange={e => setLimitPrice(parseFloat(e.target.value))}
                style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 8,
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
              />
            </div>
          )}

          {/* Payout info */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <span>YES payout: ${potentialPayoutYes.toFixed(2)}</span>
            <span>·</span>
            <span>NO payout: ${potentialPayoutNo.toFixed(2)}</span>
          </div>

          {/* Trade buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleBuyYes} style={{
              flex: 1, padding: '9px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer',
              background: '#046A38', color: 'white', border: 'none',
            }}>
              {t.buyYes}
            </button>
            <button onClick={handleBuyNo} style={{
              flex: 1, padding: '9px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer',
              background: '#c0392b', color: 'white', border: 'none',
            }}>
              {t.buyNo}
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-secondary)' }}>
        <span>{t.endsOn}: {endDate}</span>
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, color: '#FF6B00', fontWeight: 500, padding: 0,
        }}>
          {expanded ? '↑ Close' : `${t.tradeNow} →`}
        </button>
      </div>
    </div>
  );
}
