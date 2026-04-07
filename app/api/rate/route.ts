import { NextResponse } from 'next/server';
import { fetchINRRate } from '@/lib/currency';

export const revalidate = 300;

export async function GET() {
  const rate = await fetchINRRate();
  return NextResponse.json({ rate, timestamp: Date.now() });
}
