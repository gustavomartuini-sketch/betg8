import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CLOB = 'https://clob.polymarket.com';
const BUILDER_ADDRESS = process.env.BUILDER_ADDRESS || '0xE3244A59c302C99690d1d9354dAD7aa154F4a951';
const API_KEY = process.env.POLYMARKET_API_KEY || '';
const SECRET = process.env.POLYMARKET_SECRET || '';
const PASSPHRASE = process.env.POLYMARKET_PASSPHRASE || '';

function buildAuthHeaders(method: string, path: string, body: string): Record<string, string> {
  if (!API_KEY || !SECRET) return {};
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const msg = timestamp + method.toUpperCase() + path + (body || '');
  const std = SECRET.replace(/-/g, '+').replace(/_/g, '/');
  const sig = crypto.createHmac('sha256', Buffer.from(std, 'base64')).update(msg).digest('base64');
  return {
    'POLY_ADDRESS': BUILDER_ADDRESS,
    'POLY_SIGNATURE': sig,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': API_KEY,
    'POLY_PASSPHRASE': PASSPHRASE,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signedOrder, orderType = 'GTC' } = body;
    if (!signedOrder) return NextResponse.json({ error: 'signedOrder required' }, { status: 400 });

    // signatureType:
    // 0 = EOA (MetaMask hardware wallet)
    // 1 = POLY_PROXY (email/Magic/Privy embedded wallet) 
    // 2 = GNOSIS_SAFE (Safe smart wallet)
    // Privy embedded wallet = signatureType 1

    const order = {
      salt: typeof signedOrder.salt === 'string' ? parseInt(signedOrder.salt) : (signedOrder.salt || Math.floor(Math.random() * 1e15)),
      maker: signedOrder.maker,
      signer: signedOrder.signer,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: signedOrder.tokenId || signedOrder.tokenID,
      makerAmount: signedOrder.makerAmount,
      takerAmount: signedOrder.takerAmount,
      expiration: signedOrder.expiration || '0',
      nonce: signedOrder.nonce || '0',
      feeRateBps: '50',
      side: typeof signedOrder.side === 'number'
        ? (signedOrder.side === 0 ? 'BUY' : 'SELL')
        : signedOrder.side,
      signatureType: signedOrder.signatureType ?? 1, // Default to POLY_PROXY for Privy
      signature: signedOrder.signature,
    };

    const payload = JSON.stringify({
      order,
      owner: API_KEY,
      orderType,
      deferExec: false,
      builderAddress: BUILDER_ADDRESS,
    });

    const headers = buildAuthHeaders('POST', '/order', payload);
    const res = await fetch(`${CLOB}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: payload,
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('CLOB response:', res.status, text.slice(0, 400));

    if (!res.ok) {
      return NextResponse.json({
        error: data.error || data.message || text.slice(0, 300),
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, orderId: data.orderID || data.id, status: data.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const res = await fetch('https://polymarket.com/api/geoblock', {
      headers: ip ? { 'X-Forwarded-For': ip } : {},
    });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ blocked: false });
  }
}
