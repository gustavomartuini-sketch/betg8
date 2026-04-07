import { NextRequest, NextResponse } from 'next/server';

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA = 'https://gamma-api.polymarket.com';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  try {
    // Fetch positions
    const posRes = await fetch(
      `${DATA_API}/positions?user=${address}&sizeThreshold=0.01&limit=50&sortBy=CURRENT`,
      { next: { revalidate: 30 } }
    );
    const positions = posRes.ok ? await posRes.json() : [];

    // Fetch trade history
    const tradeRes = await fetch(
      `${DATA_API}/activity?user=${address}&limit=50`,
      { next: { revalidate: 30 } }
    );
    const trades = tradeRes.ok ? await tradeRes.json() : [];

    // Calculate PnL summary
    let totalBought = 0, totalCurrent = 0;
    for (const p of positions) {
      totalBought += parseFloat(p.avgPrice || 0) * parseFloat(p.size || 0);
      totalCurrent += parseFloat(p.curPrice || 0) * parseFloat(p.size || 0);
    }
    const pnl = totalCurrent - totalBought;
    const pnlPct = totalBought > 0 ? (pnl / totalBought) * 100 : 0;

    return NextResponse.json({
      positions,
      trades,
      summary: {
        bought: totalBought.toFixed(2),
        current: totalCurrent.toFixed(2),
        pnl: pnl.toFixed(2),
        pnlPct: pnlPct.toFixed(1),
      }
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), positions: [], trades: [], summary: { bought: '0', current: '0', pnl: '0', pnlPct: '0' } });
  }
}
