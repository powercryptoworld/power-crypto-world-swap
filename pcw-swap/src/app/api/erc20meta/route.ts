import { NextResponse } from "next/server";

/**
 * Simple JSON-RPC per chain (works for ERC-20/BEP-20 on any EVM).
 * No env vars needed.
 */
const RPC: Record<number, string> = {
  1: "https://rpc.ankr.com/eth",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  8453: "https://mainnet.base.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  324: "https://mainnet.era.zksync.io",
  59144: "https://rpc.linea.build",
  100: "https://rpc.gnosis.gateway.fm",
  250: "https://rpc.ftm.tools",
};

type Token = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
};

function isAddress(a: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

// 4byte selectors
const SEL_DECIMALS = "0x313ce567";
const SEL_SYMBOL   = "0x95d89b41";
const SEL_NAME     = "0x06fdde03";

function hexToNumber(hex: string) {
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex));
}

function decodeStringReturn(data: string): string {
  // dynamic ABI-encoded string
  const d = data.startsWith("0x") ? data.slice(2) : data;
  if (d.length < 64) return "";
  const offset = parseInt(d.slice(0, 64), 16);
  const lenPos = offset * 2;
  const length = parseInt(d.slice(lenPos, lenPos + 64), 16);
  const strPos = lenPos + 64;
  const hexStr = d.slice(strPos, strPos + length * 2);
  const bytes = hexStr.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function bytes32ToString(hex: string) {
  if (!hex) return "";
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  let out = "";
  for (let i = 0; i + 2 <= h.length; i += 2) {
    const code = parseInt(h.slice(i, i + 2), 16);
    if (!code) break;
    out += String.fromCharCode(code);
  }
  return out;
}

async function rpcCall(rpcUrl: string, to: string, data: string) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result as string;
}

// Sanity GET: /api/erc20meta
export async function GET() {
  return NextResponse.json({ ok: true, alive: true });
}

// Real work: POST { chainId, address }
export async function POST(req: Request) {
  try {
    const { chainId, address } = await req.json();
    const cid = Number(chainId);
    const addr = String(address || "").trim().toLowerCase();

    if (!RPC[cid]) {
      return NextResponse.json({ ok: false, error: "Unsupported chain" }, { status: 400 });
    }
    if (!isAddress(addr)) {
      return NextResponse.json({ ok: false, error: "Bad address" }, { status: 400 });
    }

    const rpc = RPC[cid];

    // decimals
    let decimals = 18;
    try {
      const decHex = await rpcCall(rpc, addr, SEL_DECIMALS);
      decimals = hexToNumber(decHex) || 18;
    } catch {}

    // symbol
    let symbol = "";
    try {
      const s = await rpcCall(rpc, addr, SEL_SYMBOL);
      if ((s?.length ?? 0) > 66) symbol = decodeStringReturn(s);
      if (!symbol && (s?.length ?? 0) === 66) symbol = bytes32ToString(s);
    } catch {}

    // name
    let name = "";
    try {
      const n = await rpcCall(rpc, addr, SEL_NAME);
      if ((n?.length ?? 0) > 66) name = decodeStringReturn(n);
      if (!name && (n?.length ?? 0) === 66) name = bytes32ToString(n);
    } catch {}

    if (!symbol && !name) {
      return NextResponse.json(
        { ok: false, error: "Could not read symbol/name (not an ERC-20?)" },
        { status: 400 }
      );
    }

    const token: Token = {
      address: addr,
      symbol: symbol || name || "TOKEN",
      name: name || symbol || "Token",
      decimals,
      logoURI: `https://tokens.1inch.io/${cid}/${addr}.png`,
    };

    return NextResponse.json({ ok: true, token });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed" },
      { status: 400 }
    );
  }
}
