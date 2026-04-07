import { EnrichedMarket, PolymarketMarket } from '@/types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// Your Polymarket Builder API Key — set in .env.local
// Get it from: polymarket.com → Profile → Builder API Keys
export const BUILDER_ADDRESS = process.env.NEXT_PUBLIC_BUILDER_ADDRESS || '';
export const BUILDER_FEE = 0.001; // 0.1% builder fee on top — optional

// Categories that map to Indian market interests
const INDIA_KEYWORDS = [
  'india', 'cricket', 'ipl', 'bcci', 'virat', 'rohit', 'dhoni',
  'bjp', 'modi', 'congress', 'mumbai', 'delhi', 'chennai', 'kolkata',
  'rupee', 'inr', 'sensex', 'nifty', 'rbi',
];

const CRICKET_KEYWORDS = ['cricket', 'ipl', 'bcci', 'test match', 't20', 'odi', 'world cup cricket'];
const IPL_KEYWORDS = ['ipl', 'indian premier league', 'mumbai indians', 'csk', 'rcb', 'kkr', 'srh', 'mi ', 'punjab kings'];
const POLITICS_KEYWORDS = ['india', 'bjp', 'modi', 'congress', 'election', 'lok sabha', 'rajya sabha'];

export function categorizeMarket(q: string): { category: string; label: string } {
  const lower = q.toLowerCase();
  if (IPL_KEYWORDS.some(k => lower.includes(k))) return { category: 'ipl', label: 'IPL 2025' };
  if (CRICKET_KEYWORDS.some(k => lower.includes(k))) return { category: 'cricket', label: 'Cricket' };
  if (POLITICS_KEYWORDS.some(k => lower.includes(k))) return { category: 'politics', label: 'Politics' };
  if (['btc', 'eth', 'bitcoin', 'crypto', 'usdc', 'defi'].some(k => lower.includes(k))) return { category: 'crypto', label: 'Crypto' };
  return { category: 'other', label: 'Global' };
}

function isIndiaRelevant(market: PolymarketMarket): boolean {
  const text = (market.question + ' ' + (market.description || '') + ' ' + (market.tags?.join(' ') || '')).toLowerCase();
  return INDIA_KEYWORDS.some(k => text.includes(k));
}

function enrichMarket(m: PolymarketMarket): EnrichedMarket {
  const yes = m.tokens?.find(t => t.outcome === 'Yes');
  const no = m.tokens?.find(t => t.outcome === 'No');
  const yesPrice = yes?.price ?? 0.5;
  const noPrice = no?.price ?? 0.5;
  const { category, label } = categorizeMarket(m.question);

  return {
    ...m,
    yesPrice,
    noPrice,
    yesTokenId: yes?.token_id ?? '',
    noTokenId: no?.token_id ?? '',
    category_label: label,
    category,
  };
}

// Fetch live markets from Polymarket Gamma API
export async function fetchIndiaMarkets(): Promise<EnrichedMarket[]> {
  try {
    // Fetch cricket/sports + general markets
    const queries = [
      `${GAMMA_API}/markets?active=true&closed=false&tag=cricket&limit=20`,
      `${GAMMA_API}/markets?active=true&closed=false&tag=india&limit=20`,
      `${GAMMA_API}/markets?active=true&closed=false&limit=100`,
    ];

    const responses = await Promise.allSettled(queries.map(url => 
      fetch(url, { next: { revalidate: 60 } }).then(r => r.json())
    ));

    const allMarkets: PolymarketMarket[] = [];
    const seen = new Set<string>();

    for (const res of responses) {
      if (res.status === 'fulfilled') {
        const data = Array.isArray(res.value) ? res.value : (res.value?.markets || []);
        for (const m of data) {
          if (m.condition_id && !seen.has(m.condition_id) && m.active && !m.closed) {
            seen.add(m.condition_id);
            allMarkets.push(m);
          }
        }
      }
    }

    // Filter India-relevant or all active markets
    let indiaMarkets = allMarkets.filter(isIndiaRelevant);

    // If we didn't get enough India-specific, supplement with global + crypto
    if (indiaMarkets.length < 10) {
      const global = allMarkets
        .filter(m => !isIndiaRelevant(m))
        .slice(0, 20 - indiaMarkets.length);
      indiaMarkets = [...indiaMarkets, ...global];
    }

    // Sort by volume descending
    indiaMarkets.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));

    return indiaMarkets.map(enrichMarket);
  } catch (err) {
    console.error('Polymarket API error:', err);
    return getFallbackMarkets();
  }
}

// Fetch live price for a specific token from CLOB
export async function fetchTokenPrice(tokenId: string): Promise<number> {
  try {
    const res = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=BUY`);
    const data = await res.json();
    return parseFloat(data.price) || 0.5;
  } catch {
    return 0.5;
  }
}

// Fetch order book for a token
export async function fetchOrderBook(tokenId: string) {
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`);
    return await res.json();
  } catch {
    return null;
  }
}

// Fallback mock markets for when API is unavailable (dev mode)
export function getFallbackMarkets(): EnrichedMarket[] {
  const base = {
    condition_id: '', question_id: '', description: '', market_slug: '',
    end_date_iso: '2025-12-31T00:00:00Z',
    game_start_time: null, seconds_delay: 0, fpmm: '', maker_base_fee: 0,
    taker_base_fee: 0, notifications_enabled: false, neg_risk: false,
    neg_risk_market_id: '', neg_risk_request_id: '', icon: '', image: '',
    rewards: { min_size: 0, max_spread: 0, event_start_date: '', event_end_date: '', in_game_multiplier: 1, reward_epoch: 0 },
    is_50_50_market: false, tags: [], enable_order_book: true, active: true,
    closed: false, archived: false, accepting_orders: true,
    accepting_order_timestamp: null, minimum_order_size: 5, minimum_tick_size: 0.01,
    groupItemTitle: '', groupItemThreshold: 0, questionID: '',
    volume: 0, volumeNum: 0, liquidity: 0, liquidityNum: 0,
    hasReviewedDates: false, ready: true, funded: true, umaResolutionStatuses: '',
    resolvedBy: '', restricted: false, pagerDutyNotificationEnabled: false,
    clobRewards: [], endDate: '2025-12-31', startDate: '2025-01-01',
    tokens: [],
  };

  return [
    {
      ...base, condition_id: 'f1', question: 'Will Mumbai Indians win IPL 2025?',
      endDate: '2025-05-25', category: 'ipl', category_label: 'IPL 2025',
      yesPrice: 0.38, noPrice: 0.62, yesTokenId: 'mi-yes', noTokenId: 'mi-no',
      volumeNum: 1200000,
      hindi_question: 'क्या मुंबई इंडियंस IPL 2025 जीतेगी?',
    },
    {
      ...base, condition_id: 'f2', question: 'Will Virat Kohli score 500+ runs in IPL 2025?',
      endDate: '2025-05-25', category: 'ipl', category_label: 'IPL 2025',
      yesPrice: 0.61, noPrice: 0.39, yesTokenId: 'vk-yes', noTokenId: 'vk-no',
      volumeNum: 890000,
      hindi_question: 'क्या विराट कोहली IPL 2025 में 500+ रन बनाएंगे?',
    },
    {
      ...base, condition_id: 'f3', question: 'Will India win the ICC Champions Trophy 2025?',
      endDate: '2025-03-09', category: 'cricket', category_label: 'Cricket',
      yesPrice: 0.72, noPrice: 0.28, yesTokenId: 'ind-yes', noTokenId: 'ind-no',
      volumeNum: 3100000,
      hindi_question: 'क्या भारत ICC चैंपियंस ट्रॉफी 2025 जीतेगा?',
    },
    {
      ...base, condition_id: 'f4', question: 'Will BJP win the Bihar state elections 2025?',
      endDate: '2025-11-30', category: 'politics', category_label: 'Politics',
      yesPrice: 0.55, noPrice: 0.45, yesTokenId: 'bjp-yes', noTokenId: 'bjp-no',
      volumeNum: 540000,
      hindi_question: 'क्या BJP बिहार चुनाव 2025 जीतेगी?',
    },
    {
      ...base, condition_id: 'f5', question: 'Will BTC reach $150K before end of 2025?',
      endDate: '2025-12-31', category: 'crypto', category_label: 'Crypto',
      yesPrice: 0.47, noPrice: 0.53, yesTokenId: 'btc-yes', noTokenId: 'btc-no',
      volumeNum: 8200000,
      hindi_question: 'क्या BTC 2025 के अंत तक $150K तक पहुंचेगा?',
    },
    {
      ...base, condition_id: 'f6', question: 'Will India launch a CBDC retail phase by Dec 2025?',
      endDate: '2025-12-31', category: 'politics', category_label: 'India',
      yesPrice: 0.31, noPrice: 0.69, yesTokenId: 'cbdc-yes', noTokenId: 'cbdc-no',
      volumeNum: 95000,
      hindi_question: 'क्या भारत दिसंबर 2025 तक CBDC रिटेल फेज लॉन्च करेगा?',
    },
    {
      ...base, condition_id: 'f7', question: 'Will Rohit Sharma retire from Test cricket in 2025?',
      endDate: '2025-12-31', category: 'cricket', category_label: 'Cricket',
      yesPrice: 0.44, noPrice: 0.56, yesTokenId: 'rohit-yes', noTokenId: 'rohit-no',
      volumeNum: 210000,
      hindi_question: 'क्या रोहित शर्मा 2025 में टेस्ट क्रिकेट से रिटायर होंगे?',
    },
    {
      ...base, condition_id: 'f8', question: 'Will ETH surpass $10K in 2025?',
      endDate: '2025-12-31', category: 'crypto', category_label: 'Crypto',
      yesPrice: 0.29, noPrice: 0.71, yesTokenId: 'eth-yes', noTokenId: 'eth-no',
      volumeNum: 4500000,
      hindi_question: 'क्या ETH 2025 में $10K को पार करेगा?',
    },
  ] as EnrichedMarket[];
}
