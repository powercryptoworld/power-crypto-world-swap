import { NextResponse } from "next/server";

const BASE = "https://api.1inch.dev/swap/v6.0";
const REFERRER = "0x75c030008c85BBFbCbDf87F54AAb22B1414Df559";

/** POST /api/oneinch/swap
 * body: { chainId:number, from:string, src:string, dst:string, amount:string, slippageBps:number, disableEstimate?:boolean }
 */
export async function POST(req: Request) {
  const key = process.env.ONEINCH_API_KEY || "";
  if (!key) {
    return NextResponse.json({ ok: false, error: "Missing ONEINCH_API_KEY" }, { status: 500 });
  }

  try {
    const {
      chainId, from, src, dst, amount,
      slippageBps = 50,
      disableEstimate = true,
    } = await req.json();

    // Convert bps → percent (25 bps -> 0.25). Cap at 3%.
    const feeBps = Number(process.env.NEXT_PUBLIC_FEE_BPS || "0");
    let feePercent = feeBps / 100;
    if (feePercent > 3) feePercent = 3;

    const url = new URL(`${BASE}/${chainId}/swap`);
    url.searchParams.set("src", src);
    url.searchParams.set("dst", dst);
    url.searchParams.set("amount", amount);
    url.searchParams.set("from", from);
    url.searchParams.set("slippage", (slippageBps / 100).toString());
    url.searchParams.set("referrer", REFERRER);
    if (feePercent > 0) url.searchParams.set("fee", feePercent.toString());
    if (disableEstimate === false) url.searchParams.set("includeGas", "true");

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });

    const text = await r.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}

    if (!r.ok) {
      const msg = data?.description || data?.error || `1inch swap failed (${r.status})`;
      return NextResponse.json({ ok: false, error: msg, data: data || text }, { status: r.status });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
