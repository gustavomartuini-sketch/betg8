import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { to, message } = await req.json();
  const SID = process.env.TWILIO_SID;
  const TOKEN = process.env.TWILIO_TOKEN;
  const FROM = process.env.TWILIO_FROM;
  if (!SID || !TOKEN || !FROM) return NextResponse.json({ error: 'Twilio env vars missing. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM in Vercel.' }, { status: 500 });
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  for (const phone of recipients) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: FROM, Body: message }).toString(),
    });
    results.push(await res.json());
  }
  return NextResponse.json({ success: true, results, sent: recipients.length });
}
