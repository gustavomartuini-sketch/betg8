import { NextRequest, NextResponse } from 'next/server';
const GAMMA = 'https://gamma-api.polymarket.com';
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'markets';
  if (!q.trim()) return NextResponse.json({ results: [] });
  try {
    const url = type === 'events'
      ? `${GAMMA}/events?q=${encodeURIComponent(q)}&active=true&limit=20`
      : `${GAMMA}/markets?q=${encodeURIComponent(q)}&active=true&closed=false&limit=20`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const results = Array.isArray(data) ? data : (data?.markets || data?.events || []);
    return NextResponse.json({ results, count: results.length, query: q });
  } catch (err) {
    return NextResponse.json({ results: [], error: String(err) });
  }
}
