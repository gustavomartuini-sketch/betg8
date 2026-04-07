import { NextResponse } from 'next/server';

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';
const DATA = 'https://data-api.polymarket.com';

function normalizeMarket(m: Record<string, unknown>) {
  const outcomes = JSON.parse(String(m.outcomes || '["Yes","No"]'));
  const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
  const clobIds = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];

  const tokens = outcomes.map((outcome: string, i: number) => ({
    token_id: String(clobIds[i] || `${m.conditionId}-${i}`),
    outcome,
    price: String(prices[i] || 0.5),
  }));

  return {
    condition_id: String(m.conditionId || ''),
    question: String(m.question || ''),
    description: String(m.description || ''),
    market_slug: String(m.slug || ''),
    end_date_iso: String(m.endDate || ''),
    endDate: String(m.endDate || ''),
    image: String(m.image || ''),
    icon: String(m.icon || ''),
    active: Boolean(m.active),
    volume: String(m.volume || '0'),
    volumeNum: parseFloat(String(m.volume || '0')),
    volume24hr: parseFloat(String(m.volume24hrClob || '0')),
    liquidity: String(m.liquidity || '0'),
    tokens,
    tags: [],
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    const marketRes = await fetch(`${GAMMA}/markets/slug/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 15 }
    });
    if (!marketRes.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const raw = await marketRes.json();
    const market = normalizeMarket(raw);

    // Fetch order books using real clobTokenIds
    const books = await Promise.all(
      market.tokens.map((t: {token_id: string}) =>
        t.token_id && !t.token_id.includes('-0') && !t.token_id.includes('-1')
          ? fetch(`${CLOB}/book?token_id=${t.token_id}`, { next: { revalidate: 5 } })
              .then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null)
      )
    );

    let recentTrades: unknown[] = [];
    try {
      const tr = await fetch(
        `${DATA}/trades?market=${market.condition_id}&limit=20&offset=0&filterType=TOKENS&filterAmount=100000`,
        { next: { revalidate: 10 } }
      );
      if (tr.ok) recentTrades = await tr.json();
    } catch { /* ignore */ }

    return NextResponse.json({ market, books, recentTrades, timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
