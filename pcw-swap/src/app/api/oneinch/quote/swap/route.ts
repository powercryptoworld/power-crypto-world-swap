// src/app/api/oneinch/swap/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as any;
  const chainId = body?.chainId;
  const payload = body?.payload;

  if (!chainId || !payload) {
    return NextResponse.json({ error: "chainId & payload required" }, { status: 400 });
  }

  // attach your fee from env
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT!;
  const feeBps = Number(process.env.NEXT_PUBLIC_FEE_BPS || 0);
  payload.fee = { feeRecipient, feePercent: feeBps };
  payload.referrer = feeRecipient;

  const ONEINCH_BASE = process.env.ONEINCH_BASE!;
  const ONEINCH_KEY = process.env.ONEINCH_KEY!;

  const r = await fetch(`${ONEINCH_BASE}/swap/v6.0/${chainId}/swap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${ONEINCH_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
