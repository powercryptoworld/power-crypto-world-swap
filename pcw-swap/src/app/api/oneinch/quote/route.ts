// src/app/api/oneinch/quote/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get("chainId");
  if (!chainId) {
    return NextResponse.json({ error: "chainId required" }, { status: 400 });
  }

  const ONEINCH_BASE = process.env.ONEINCH_BASE!;
  const ONEINCH_KEY = process.env.ONEINCH_KEY!;
  const url = `${ONEINCH_BASE}/swap/v6.0/${chainId}/quote?` + searchParams.toString();

  const r = await fetch(url, { headers: { Authorization: `Bearer ${ONEINCH_KEY}` } });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
