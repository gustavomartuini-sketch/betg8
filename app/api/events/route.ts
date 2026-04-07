import { NextResponse } from 'next/server';

const GAMMA = 'https://gamma-api.polymarket.com';

function categorize(title: string): string {
  const t = title.toLowerCase();
  if (/bitcoin|btc|ethereum|eth|crypto|solana|defi|blockchain|nft|token|coin/.test(t)) return 'Crypto';
  if (/election|vote|ballot|candidate|primary|runoff/.test(t)) return 'Elections';
  if (/president|congress|senate|democrat|republican|trump|modi|parliament|minister|political|govern/.test(t)) return 'Politics';
  if (/nba|nfl|mlb|nhl|soccer|football|basketball|baseball|tennis|golf|formula|f1|ufc|boxing|world cup|ipl|cricket|premier league|bundesliga|esport|sport/.test(t)) return 'Sports';
  if (/stock|s&p|nasdaq|dow|fed |interest rate|gdp|inflation|earnings|revenue|ipo|merger|bond|yield/.test(t)) return 'Finance';
  if (/iran|russia|ukraine|china|taiwan|nato|israel|gaza|war|conflict|sanctions|military|nuclear|ceasefire/.test(t)) return 'Geopolitics';
  if (/quarterly|fiscal|eps|earnings per/.test(t)) return 'Earnings';
  if (/artificial intelligence|openai|google|apple|microsoft|meta|amazon|tesla|nvidia|chatgpt|robot| tech|software/.test(t)) return 'Tech';
  if (/oscar|emmy|grammy|celebrity|movie|film|music|award|entertainment|singer/.test(t)) return 'Culture';
  if (/climate|environment|covid|pandemic|united nations/.test(t)) return 'World';
  if (/economy|recession|unemployment|jobs|housing|debt|budget|tax/.test(t)) return 'Economy';
  if (/mentions|tweets|posts|followers/.test(t)) return 'Mentions';
  return 'Trending';
}

async function fetchPage(offset: number): Promise<Record<string, unknown>[]> {
  try {
    const url = `${GAMMA}/events?active=true&closed=false&limit=100&offset=${offset}&order=volume&ascending=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Betg8/1.0)' },
      next: { revalidate: 120 }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag') || 'Trending';

  try {
    // Fetch 10 pages = 1000 events in parallel
    const pages = Array.from({ length: 10 }, (_, i) => i * 100);
    const results = await Promise.allSettled(pages.map(offset => fetchPage(offset)));

    let allEvents: Record<string, unknown>[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') allEvents.push(...result.value);
    }

    // Deduplicate
    const seen = new Set<string>();
    allEvents = allEvents.filter(e => {
      const id = String(e.id || e.slug);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Normalize
    const events = allEvents.map(e => {
      const markets: Record<string, unknown>[] = (e.markets as Record<string, unknown>[] || []);
      let outcomes: { outcome: string; price: number; token_id?: string }[] = [];

      if (markets.length === 1) {
        const m = markets[0];
        const outcomeList = JSON.parse(String(m.outcomes || '["Yes","No"]'));
        const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
        const clobIds = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];
        outcomes = outcomeList.map((o: string, i: number) => ({
          outcome: o, price: parseFloat(String(prices[i] || 0.5)), token_id: String(clobIds[i] || '')
        }));
      } else {
        outcomes = markets.slice(0, 6).map(m => {
          const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
          return { outcome: String(m.groupItemTitle || m.question || '').slice(0, 35), price: parseFloat(String(prices[0] || 0.5)) };
        });
      }

      const title = String(e.title || markets[0]?.question || '');
      return {
        id: e.id,
        title,
        slug: String(e.slug || markets[0]?.slug || ''),
        image: String(e.image || markets[0]?.image || markets[0]?.icon || ''),
        volume: parseFloat(String(e.volume || '0')),
        volume24h: parseFloat(String(e.volume24hrClob || e.volume24hr || '0')),
        numMarkets: markets.length,
        endDate: String(e.endDate || markets[0]?.endDate || ''),
        tags: (e.tags as { label: string; slug: string }[] || []).map(t => t.label),
        category: categorize(title),
        markets: markets.map(m => {
          const outcomeList = JSON.parse(String(m.outcomes || '["Yes","No"]'));
          const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
          const clobIds = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];
          return {
            condition_id: String(m.conditionId || ''),
            question: String(m.question || ''),
            groupItemTitle: String(m.groupItemTitle || ''),
            slug: String(m.slug || ''),
            volume: parseFloat(String(m.volume || '0')),
            liquidity: parseFloat(String(m.liquidity || '0')),
            image: String(m.image || m.icon || e.image || ''),
            tokens: outcomeList.map((o: string, i: number) => ({
              token_id: String(clobIds[i] || ''), outcome: o, price: String(prices[i] || '0.5')
            })),
            active: Boolean(m.active),
            restricted: Boolean(m.restricted),
            endDate: String(m.endDate || ''),
          };
        }).filter(m => m.active),
        _outcomes: outcomes,
      };
    }).filter(e => e.title && e.slug);

    // Filter by category
    let filtered: typeof events;
    if (tag === 'Trending') {
      filtered = events.slice(0, 200); // Top 200 by volume for trending
    } else {
      filtered = events.filter(e => e.category === tag);
    }

    return NextResponse.json({
      events: filtered,
      count: filtered.length,
      total: allEvents.length,
      timestamp: Date.now()
    });
  } catch (err) {
    return NextResponse.json({ events: [], count: 0, error: String(err) }, { status: 500 });
  }
}
