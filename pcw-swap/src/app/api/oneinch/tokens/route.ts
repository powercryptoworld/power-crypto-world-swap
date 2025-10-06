import { NextResponse } from "next/server";

const BASE = "https://api.1inch.dev/swap/v6.0";

function key() {
  const k = process.env.ONEINCH_API_KEY;
  if (!k) throw new Error("Missing ONEINCH_API_KEY");
  return k;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get("chainId");
    if (!chainId) {
      return NextResponse.json({ ok: false, error: "chainId required" }, { status: 400 });
    }
    const url = `${BASE}/${chainId}/tokens`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key()}`, accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "tokens failed", details: text.slice(0, 500) },
        { status: r.status || 502 }
      );
    }

    // Pass through 1inch tokens (has symbol/decimals/logoURI/name)
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
