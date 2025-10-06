import { NextResponse } from "next/server";

const BASE = "https://api.1inch.dev/swap/v6.0";

function key() {
  const k = process.env.ONEINCH_API_KEY;
  if (!k) throw new Error("Missing ONEINCH_API_KEY");
  return k;
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const { chainId, src, dst, amount } = b || {};
    if (!chainId || !src || !dst || !amount) {
      return NextResponse.json(
        { ok: false, error: "chainId, src, dst, amount required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      src,
      dst,
      amount,
      includeTokensInfo: "true",
      includeProtocols: "false",
    });

    const url = `${BASE}/${chainId}/quote?${params.toString()}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key()}`, accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "quote failed", details: text.slice(0, 800), data },
        { status: r.status || 502 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
