import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { to, subject, html, text } = await req.json();
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: 'No RESEND_API_KEY configured' }, { status: 500 });
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Betg8 <noreply@betg8.com>', to: batch, subject, html: html || `<p>${text}</p>`, text: text || subject }),
    });
    results.push(await res.json());
  }
  return NextResponse.json({ success: true, results, sent: recipients.length });
}
