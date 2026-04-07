import { NextResponse } from 'next/server';

const GAMMA = 'https://gamma-api.polymarket.com';

export const revalidate = 60;

function normalizeEvent(e: Record<string, unknown>) {
  const markets = (e.markets as Record<string, unknown>[] || []).map(m => {
    const outcomes = JSON.parse(String(m.outcomes || '["Yes","No"]'));
    const prices = JSON.parse(String(m.outcomePrices || '[0.5,0.5]'));
    const clobIds = m.clobTokenIds ? JSON.parse(String(m.clobTokenIds)) : [];
    return {
      condition_id: String(m.conditionId || ''),
      question: String(m.question || ''),
      market_slug: String(m.slug || ''),
      end_date_iso: String(m.endDate || ''),
      volume: String(m.volume || '0'),
      volumeNum: parseFloat(String(m.volume || '0')),
      image: String(m.image || e.image || ''),
      tokens: outcomes.map((o: string, i: number) => ({
        token_id: String(clobIds[i] || `${m.conditionId}-${i}`),
        outcome: o,
        price: String(prices[i] || 0.5),
      })),
    };
  });

  const totalVol = markets.reduce((s, m) => s + m.volumeNum, 0);
  const tags: {label: string; slug: string}[] = (e.tags as {label: string; slug: string}[] || []);

  return {
    event_slug: String(e.slug || ''),
    title: String(e.title || ''),
    image: String(e.image || ''),
    volume: totalVol,
    liquidity: parseFloat(String(e.liquidity || '0')),
    market_count: markets.length,
    tags,
    markets,
    startDate: String(e.startDate || ''),
    endDate: String(e.endDate || ''),
    active: Boolean(e.active),
    closed: Boolean(e.closed),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag') || '';
  const limit = searchParams.get('limit') || '40';

  try {
    // Fetch events (groups of markets) from Gamma
    let url = `${GAMMA}/events?active=true&closed=false&limit=${limit}&order=volume&ascending=false`;
    if (tag && tag !== 'all') url += `&tag_slug=${tag}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 }
    });

    if (!res.ok) throw new Error(`Gamma ${res.status}`);
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.events || []);
    const events = raw
      .filter((e: Record<string, unknown>) => e.active && !e.closed)
      .map(normalizeEvent);

    return NextResponse.json({ events, count: events.length, timestamp: Date.now() });
  } catch (err) {
    console.error('Events error:', err);
    return NextResponse.json({ events: [], count: 0, error: String(err) }, { status: 500 });
  }
}
