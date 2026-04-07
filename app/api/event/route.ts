import { NextResponse } from 'next/server';

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';
const DATA = 'https://data-api.polymarket.com';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    // Try event endpoint first
    const eventRes = await fetch(`${GAMMA}/events?slug=${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 30 }
    });
    
    let event = null;
    let markets: Record<string, unknown>[] = [];

    if (eventRes.ok) {
      const data = await eventRes.json();
      event = Array.isArray(data) ? data[0] : data;
      markets = event?.markets || [];
    }

    // If no event, try as single market
    if (!event || markets.length === 0) {
      const mRes = await fetch(`${GAMMA}/markets/slug/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 30 }
      });
      if (mRes.ok) {
        const m = await mRes.json();
        event = { title: m.question, image: m.image || m.icon, slug, volume: m.volume, tags: [] };
        markets = [m];
      }
    }

    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Normalize markets
    const normalizedMarkets = markets.map((m: Record<string, unknown>) => {
      const outcomes = JSON.parse(String(m.outcomes || '["Yes","No"]'));
      const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
      const clobIds = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];
      return {
        condition_id: String(m.conditionId || m.condition_id || ''),
        question: String(m.question || ''),
        slug: String(m.slug || m.market_slug || ''),
        groupItemTitle: String(m.groupItemTitle || ''),
        endDate: String(m.endDate || ''),
        volume: parseFloat(String(m.volume || '0')),
        liquidity: parseFloat(String(m.liquidity || '0')),
        image: String(m.image || m.icon || event?.image || ''),
        tokens: outcomes.map((o: string, i: number) => ({
          token_id: String(clobIds[i] || ''),
          outcome: o,
          price: String(prices[i] || '0.5'),
        })),
        active: Boolean(m.active),
      };
    }).filter(m => m.active);

    // Get order book for first market
    const firstMarket = normalizedMarkets[0];
    let books: (unknown | null)[] = [null, null];
    if (firstMarket?.tokens?.[0]?.token_id) {
      books = await Promise.all(
        firstMarket.tokens.slice(0, 2).map((t: { token_id: string }) =>
          t.token_id
            ? fetch(`${CLOB}/book?token_id=${t.token_id}`, { next: { revalidate: 5 } })
                .then(r => r.ok ? r.json() : null).catch(() => null)
            : Promise.resolve(null)
        )
      );
    }

    // Get recent trades
    let recentTrades: unknown[] = [];
    if (firstMarket?.condition_id) {
      try {
        const tr = await fetch(
          `${DATA}/trades?market=${firstMarket.condition_id}&limit=20&offset=0&filterType=TOKENS&filterAmount=100000`,
          { next: { revalidate: 10 } }
        );
        if (tr.ok) recentTrades = await tr.json();
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      event: { ...event, markets: normalizedMarkets },
      markets: normalizedMarkets,
      books,
      recentTrades,
      timestamp: Date.now()
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
