"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* =======================
   Types
======================= */

type Token = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
};
type TokensByAddr = Record<string, Token>;

type QuoteOk = {
  ok: true;
  data: {
    srcToken: Token;
    dstToken: Token;
    dstAmount: string; // units
  };
};
type QuoteFail = { ok: false; error: string };
type QuoteResponse = QuoteOk | QuoteFail;

type SwapBuildOk = {
  ok: true;
  data: {
    tx?: {
      to: string;
      from?: string;
      data: string;
      value?: any;
      gas?: any;
      gasPrice?: any;
      maxFeePerGas?: any;
      maxPriorityFeePerGas?: any;
    };
    spender?: string;
    allowanceTarget?: string;
  };
};
type SwapBuildFail = { ok: false; error: string };
type SwapBuildResponse = SwapBuildOk | SwapBuildFail;

/* =======================
   Constants & helpers
======================= */

const fmt = (n: number, d = 6) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
const short = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const CHAINS: { id: number; name: string }[] = [
  { id: 56, name: "BNB Chain" },
  { id: 1, name: "Ethereum" },
  { id: 137, name: "Polygon" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 8453, name: "Base" },
  { id: 43114, name: "Avalanche" },
];

const NATIVE_PRIORITIES: Record<number, string[]> = {
  56: ["BNB", "WBNB"],
  1: ["ETH", "WETH"],
  137: ["MATIC", "WMATIC", "POL", "WPOL"],
  42161: ["ETH", "WETH"],
  10: ["ETH", "WETH"],
  8453: ["ETH", "WETH"],
  43114: ["AVAX", "WAVAX"],
};

function isNativeSymbol(chainId: number, sym?: string) {
  if (!sym) return false;
  const set = NATIVE_PRIORITIES[chainId] || [];
  return set.includes(sym.toUpperCase());
}
function asNativeToken(chainId: number, base?: Token): Token | undefined {
  if (!base) return undefined;
  return {
    address: NATIVE,
    symbol: base.symbol,
    name: base.name || base.symbol,
    decimals: 18,
    logoURI: base.logoURI,
  };
}
const isAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());

/** 1inch v6 Spender fallback */
const ONE_INCH_V6_SPENDER: Record<number, string> = {
  1: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  56: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  137: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  42161: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  10: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  8453: "0x1111111254EEB25477B68fb85Ed929f73A960582",
  43114: "0x1111111254EEB25477B68fb85Ed929f73A960582",
};

async function ensureChain(chainId: number) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  const targetHex = "0x" + chainId.toString(16);
  const current = parseInt(await eth.request({ method: "eth_chainId" }), 16);
  if (current === chainId) return;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  } catch (e: any) {
    if (e?.code === 4902) {
      throw new Error("Add the network in MetaMask, then try again.");
    }
    throw e;
  }
}

async function safeJson<T = any>(r: Response): Promise<T | null> {
  try {
    const txt = await r.text();
    if (!txt) return null;
    const first = txt.trim()[0];
    if (first !== "{" && first !== "[") return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/* =======================
   Server API helpers
======================= */

async function readErc20MetaViaRpc(
  chainId: number,
  address: string
): Promise<Token | null> {
  const r = await fetch("/api/erc20meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId, address }),
  });
  if (!r.ok) return null;
  const j = await safeJson(r);
  if (j?.ok && j?.token) return j.token as Token;
  return null;
}
async function getSpender(chainId: number): Promise<string> {
  try {
    const r = await fetch(`/api/oneinch/spender?chainId=${chainId}`);
    const j = await safeJson<{ address: string }>(r);
    if (j?.address && isAddress(j.address)) return j.address;
  } catch {}
  return ONE_INCH_V6_SPENDER[chainId] || ONE_INCH_V6_SPENDER[1];
}
async function fetchTokens(chainId: number): Promise<TokensByAddr> {
  const r = await fetch(`/api/oneinch/tokens?chainId=${chainId}`);
  const j = await safeJson(r);
  let map: TokensByAddr | undefined = j?.tokens || j?.data?.tokens;
  if (!map && Array.isArray(j)) {
    map = {};
    (j as any[]).forEach((t: any) => {
      map![String(t.address).toLowerCase()] = t;
    });
  }
  const norm: TokensByAddr = {};
  if (!map) return norm;
  for (const [kRaw, tRaw] of Object.entries(map)) {
    const k = kRaw.toLowerCase();
    const t: any = { ...tRaw };
    t.address = String(t.address);
    if (!t.logoURI) t.logoURI = t.logoUrl || t.logo || t.icon || undefined;
    norm[k] = t as Token;
  }
  return norm;
}

/* =======================
   Wallet helpers
======================= */

function toUnits(amount: string, decimals: number): string {
  const [i, f = ""] = (amount || "0").split(".");
  const cleanI = i.replace(/\D/g, "") || "0";
  const cleanF = (f.replace(/\D/g, "") + "0".repeat(decimals)).slice(0, decimals);
  const s =
    BigInt(cleanI) * (BigInt(10) ** BigInt(decimals)) + BigInt(cleanF || "0");
  return s.toString();
}

async function readTokenBalance(account: string, token: Token): Promise<number> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");

  if (token.address.toLowerCase() === NATIVE.toLowerCase()) {
    const hexBal: string = await eth.request({
      method: "eth_getBalance",
      params: [account, "latest"],
    });
    const wei = BigInt(hexBal || "0x0");
    return Number(wei) / 10 ** (token.decimals || 18);
  }

  const selector = "0x70a08231"; // balanceOf
  const addr = account.replace(/^0x/, "").padStart(64, "0");
  const data = selector + addr;
  const hex: string = await eth.request({
    method: "eth_call",
    params: [{ to: token.address, data }, "latest"],
  });
  const raw = BigInt(hex || "0x0");
  return Number(raw) / 10 ** (token.decimals || 18);
}

async function readAllowance(
  owner: string,
  spender: string,
  token: Token
): Promise<bigint> {
  if (token.address.toLowerCase() === NATIVE.toLowerCase()) return BigInt(2) ** BigInt(255);
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");

  const selector = "0xdd62ed3e"; // allowance(address,address)
  const a = owner.replace(/^0x/, "").padStart(64, "0");
  const s = spender.replace(/^0x/, "").padStart(64, "0");
  const data = selector + a + s;
  const hex: string = await eth.request({
    method: "eth_call",
    params: [{ to: token.address, data }, "latest"],
  });
  return BigInt(hex || "0x0");
}

async function approveUnlimited(
  chainId: number,
  owner: string,
  token: Token,
  spender: string
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  await ensureChain(chainId);
  if (token.address.toLowerCase() === NATIVE.toLowerCase()) return null;

  // try proxy helper
  try {
    const r = await fetch("/api/oneinch/approve/transaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId,
        tokenAddress: token.address,
        amount:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    });
    const j = await safeJson<any>(r);
    if (j?.to && j?.data) {
      const txParams = { from: owner, to: j.to, data: j.data, value: "0x0" };
      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });
      return txHash;
    }
  } catch {}

  // fallback: raw approve
  const approveSel = "0x095ea7b3";
  const max =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const data =
    approveSel + spender.replace(/^0x/, "").padStart(64, "0") + max;
  const txParams = { from: owner, to: token.address, data, value: "0x0" };
  const txHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [txParams],
  });
  return txHash;
}

/* =======================
   Pricing helpers
======================= */

function pickUSDC(map: TokensByAddr): Token | undefined {
  const vals = Object.values(map);
  return (
    vals.find((t) => (t.symbol || "").toUpperCase() === "USDC" && t.decimals === 6) ||
    vals.find((t) => (t.symbol || "").toUpperCase() === "USDC") ||
    vals.find((t) => (t.name || "").toLowerCase().includes("usd coin")) ||
    undefined
  );
}
async function miniQuoteTokens(opts: {
  chainId: number;
  src: Token;
  dst: Token;
  amountTokens: number;
}): Promise<number | null> {
  const { chainId, src, dst, amountTokens } = opts;
  try {
    const r = await fetch("/api/oneinch/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId,
        src: src.address,
        dst: dst.address,
        amount: toUnits(String(amountTokens), src.decimals),
      }),
    });
    const j = (await safeJson<QuoteResponse>(r)) as QuoteResponse | null;
    if (!j || !("ok" in j) || !j.ok) return null;
    const out = Number(j.data.dstAmount) / 10 ** (j.data.dstToken.decimals || 18);
    return out;
  } catch {
    return null;
  }
}
async function tokenUsdPrice(
  chainId: number,
  tkn: Token,
  usdc: Token
): Promise<number | null> {
  if ((tkn.symbol || "").toUpperCase() === "USDC") return 1;
  const eps = Math.pow(10, -Math.min(6, tkn.decimals)) * 10;
  const out = await miniQuoteTokens({
    chainId,
    src: tkn,
    dst: usdc,
    amountTokens: eps,
  });
  if (out == null) return null;
  return out / eps;
}

/* =======================
   Token Picker
======================= */

function TokenPicker(props: {
  open: boolean;
  onClose: () => void;
  onPick: (t: Token) => void;
  tokens?: TokensByAddr;
  chainId: number;
}) {
  const { open, onClose, onPick, tokens, chainId } = props;

  const [q, setQ] = useState<string>("");
  const [pendingAddr, setPendingAddr] = useState<Token | null>(null);

  const list = useMemo(() => {
    const arr = Object.values(tokens || {});
    arr.sort(
      (a, b) =>
        (a.symbol || "").localeCompare(b.symbol || "") ||
        (a.name || "").localeCompare(b.name || "")
    );
    return arr;
  }, [tokens]);

  const filtered = useMemo(() => {
    const v = (q || "").trim();
    if (!v) return list;
    if (isAddress(v)) {
      const hit = (tokens || {})[v.toLowerCase()];
      return hit ? [hit] : [];
    }
    const s = v.toLowerCase();
    return list.filter(
      (t) =>
        (t.symbol || "").toLowerCase().includes(s) ||
        (t.name || "").toLowerCase().includes(s) ||
        t.address.toLowerCase().includes(s)
    );
  }, [q, list, tokens]);

  useEffect(() => {
    (async () => {
      const v = (q || "").trim();
      if (!isAddress(v)) {
        setPendingAddr(null);
        return;
      }
      if ((tokens || {})[v.toLowerCase()]) {
        setPendingAddr(null);
        return;
      }
      const meta = await readErc20MetaViaRpc(chainId, v);
      setPendingAddr(meta);
    })();
  }, [q, tokens, chainId]);

  if (!open) return null;

  const choose = (t: Token) => {
    onPick(t);
    setQ("");
    setPendingAddr(null);
    onClose();
  };

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="phead">
          <div className="ptitle">Select a token</div>
          <button className="pclose" onClick={onClose}>✕</button>
        </div>

        <div className="psearch">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by symbol, name, or paste address…"
          />
          {pendingAddr && (
            <button className="padd" onClick={() => choose(pendingAddr)}>
              Add by address
            </button>
          )}
        </div>

        <div className="plist">
          {filtered.length === 0 && !pendingAddr && (
            <div className="pempty">No matches. Paste a contract address above to add it.</div>
          )}
          {filtered.map((t) => (
            <button key={t.address} className="prow" onClick={() => choose(t)}>
              {t.logoURI ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logoURI} alt="" />
              ) : (
                <span className="dot" />
              )}
              <div className="pcol">
                <div className="psym">{t.symbol}</div>
                <div className="pmeta">{t.name}</div>
              </div>
              <div className="paddr">{short(t.address)}</div>
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .picker-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55);
          display: grid; place-items: center; z-index: 50;
        }
        .picker {
          width: 720px; max-width: calc(100% - 24px);
          background: #0b152b; border: 1px solid #1d2a44; border-radius: 16px;
          color: #e6eaf2; padding: 12px;
        }
        .phead { display:flex; justify-content:space-between; align-items:center; padding: 4px 6px 10px; }
        .ptitle { font-weight:800; }
        .pclose { background:transparent; color:#a8b4c9; border:0; font-size:18px; cursor:pointer; }
        .psearch { display:flex; gap:8px; padding: 6px; }
        .psearch input {
          flex:1; border:1px solid #1d2a44; background:#0f1b34; color:#e6eaf2; border-radius:10px; padding:8px 10px;
        }
        .padd { border:1px solid #2c3a58; background:transparent; color:#9fd6ff; border-radius:10px; padding:6px 10px; }
        .plist { max-height:420px; overflow:auto; padding: 6px; display:flex; flex-direction:column; gap:4px; }
        .prow {
          display:flex; align-items:center; gap:10px; width:100%; text-align:left;
          border:1px solid #1d2a44; background:rgba(255,255,255,0.02); border-radius:12px; padding:8px 10px;
          color:#e6eaf2; cursor:pointer;
        }
        .prow img { width:22px; height:22px; border-radius:999px; }
        .dot { width:10px; height:10px; border-radius:50%; background:#64748b; display:inline-block; }
        .pcol { flex:1; display:flex; flex-direction:column; }
        .psym { font-weight:700; }
        .pmeta { font-size:12px; color:#a8b4c9; }
        .paddr { font-size:12px; color:#94a3b8; }
        .pempty { padding: 16px; text-align:center; color:#a8b4c9; }
      `}</style>
    </div>
  );
}

/* =======================
   UI Component
======================= */

export default function Page() {
  /* Wallet */
  const [account, setAccount] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [chainId, setChainId] = useState<number>(56); // default BNB

  /* Tokens */
  const [tokens, setTokens] = useState<TokensByAddr | undefined>(undefined);
  const [srcToken, setSrcToken] = useState<Token | undefined>(undefined);
  const [dstToken, setDstToken] = useState<Token | undefined>(undefined);
  const [pickSrcOpen, setPickSrcOpen] = useState(false);
  const [pickDstOpen, setPickDstOpen] = useState(false);

  /* Editing */
  const [editSide, setEditSide] = useState<"src" | "dst">("src");
  const [amountIn, setAmountIn] = useState<string>("1");
  const [amountOut, setAmountOut] = useState<string>("");
  const [computedInFromOut, setComputedInFromOut] = useState<string>("0");

  /* Slippage */
  const [slipMode, setSlipMode] = useState<"slow" | "market" | "fast" | "custom">(
    "market"
  );
  const [customSlip, setCustomSlip] = useState<string>("");

  /* Quote + USD */
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const [payUsd, setPayUsd] = useState<number | null>(null);
  const [recvUsd, setRecvUsd] = useState<number | null>(null);

  /* Balances */
  const [srcBal, setSrcBal] = useState<number | null>(null);
  const [dstBal, setDstBal] = useState<number | null>(null);

  /* Spender */
  const [spender, setSpender] = useState<string | null>(null);

  /* Price impact */
  const [impact, setImpact] = useState<number | null>(null);

  const debounceRef = useRef<number | null>(null);

  const bps = useMemo(
    () =>
      slipMode === "slow"
        ? 10
        : slipMode === "fast"
        ? 50
        : slipMode === "custom"
        ? Math.round(Math.max(0, Number(customSlip || "0")) * 100)
        : 25,
    [slipMode, customSlip]
  );

  /* Wallet connect */
  async function connect() {
    const eth = (window as any).ethereum;
    if (!eth) return alert("MetaMask not found");
    const accts: string[] = await eth.request({ method: "eth_requestAccounts" });
    setAccount(accts[0]);
    const hexId: string = await eth.request({ method: "eth_chainId" });
    const id = parseInt(hexId, 16);
    setWalletChainId(id);
    setChainId((prev) => prev || id);

    eth.removeAllListeners?.("accountsChanged");
    eth.removeAllListeners?.("chainChanged");
    eth.on?.("accountsChanged", (a: string[]) => setAccount(a?.[0] ?? null));
    eth.on?.("chainChanged", (hex: string) =>
      setWalletChainId(parseInt(hex, 16) || null)
    );
  }
  function disconnect() {
    setAccount(null);
  }

  /* Switch wallet chain if user changes in UI */
  useEffect(() => {
    (async () => {
      try {
        if (walletChainId == null || walletChainId === chainId) return;
        await ensureChain(chainId);
      } catch (e: any) {
        console.warn("chain switch failed:", e?.message || e);
      }
    })();
  }, [chainId, walletChainId]);

  /* Load tokens & spender on chain change */
  useEffect(() => {
    let stop = false;
    setTokens(undefined);
    setSrcToken(undefined);
    setDstToken(undefined);
    setSpender(null);
    (async () => {
      try {
        const map = await fetchTokens(chainId);
        if (stop) return;
        setTokens(map);

        const vals = Object.values(map);
        const nat =
          (NATIVE.toLowerCase() in map && asNativeToken(chainId, map[NATIVE.toLowerCase()])) ||
          (vals.find((t) => isNativeSymbol(chainId, t.symbol)) &&
            asNativeToken(chainId, vals.find((t) => isNativeSymbol(chainId, t.symbol))!)) ||
          undefined;

        const usdc = pickUSDC(map);

        setSrcToken(nat || vals[0]);
        setDstToken(usdc || vals.find((v) => v !== (nat || vals[0])) || vals[1]);

        const sp = await getSpender(chainId);
        setSpender(sp);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      stop = true;
    };
  }, [chainId]);

  function onPickSrc(t: Token) {
    if (isNativeSymbol(chainId, t.symbol) || t.address.toLowerCase() === NATIVE.toLowerCase()) {
      const nat = asNativeToken(chainId, t);
      setSrcToken(nat || t);
    } else {
      setSrcToken(t);
    }
  }
  function onPickDst(t: Token) {
    setDstToken(t);
  }

  /* Quotes (both directions) + price impact (vs tiny trade) */
  useEffect(() => {
    if (!srcToken || !dstToken) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setQuoting(true);
      setQuoteErr(null);
      setImpact(null);
      try {
        if (editSide === "src") {
          const r = await fetch("/api/oneinch/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chainId,
              src: srcToken.address,
              dst: dstToken.address,
              amount: toUnits(amountIn || "0", srcToken.decimals),
            }),
          });
          const j = (await safeJson<QuoteResponse>(r)) as QuoteResponse | null;
          if (!j || !("ok" in j) || !j.ok) {
            setQuote(j || { ok: false, error: "quote failed" });
            setQuoteErr((j as any)?.error || "quote failed");
          } else {
            setQuote(j);
            // price impact vs tiny quote
            const aIn = Number(amountIn || "0");
            if (aIn > 0) {
              const tiny = await miniQuoteTokens({
                chainId,
                src: srcToken,
                dst: dstToken,
                amountTokens: Math.pow(10, -Math.min(6, srcToken.decimals)) * 10,
              });
              const big =
                Number(j.data.dstAmount) /
                10 ** (j.data.dstToken.decimals || dstToken.decimals);
              if (tiny && aIn) {
                const rateBig = big / aIn;
                const rateTiny = tiny / (Math.pow(10, -Math.min(6, srcToken.decimals)) * 10);
                const imp = Math.max(0, 1 - rateBig / rateTiny);
                setImpact(imp);
              }
            }
          }
        } else {
          // edit desired OUT -> compute needed IN
          const r = await fetch("/api/oneinch/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chainId,
              src: dstToken.address,
              dst: srcToken.address,
              amount: toUnits(amountOut || "0", dstToken.decimals),
            }),
          });
          const j = (await safeJson<QuoteResponse>(r)) as QuoteResponse | null;
          if (!j || !("ok" in j) || !j.ok) {
            setQuote(j || { ok: false, error: "quote failed" });
            setQuoteErr((j as any)?.error || "quote failed");
            setComputedInFromOut("0");
          } else {
            const needIn =
              Number(j.data.dstAmount) / 10 ** (srcToken.decimals || 18);
            setComputedInFromOut(needIn ? String(needIn) : "0");

            // forward quote so the UI shows dstAmount
            const f = await fetch("/api/oneinch/quote", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chainId,
                src: srcToken.address,
                dst: dstToken.address,
                amount: toUnits(String(needIn || 0), srcToken.decimals),
              }),
            });
            const fwd = (await safeJson<QuoteResponse>(f)) as QuoteResponse | null;
            setQuote(fwd || j);

            // impact
            if (needIn > 0) {
              const tiny = await miniQuoteTokens({
                chainId,
                src: srcToken,
                dst: dstToken,
                amountTokens: Math.pow(10, -Math.min(6, srcToken.decimals)) * 10,
              });
              const bigOut =
                (fwd && "ok" in fwd && fwd.ok
                  ? Number(fwd.data.dstAmount)
                  : Number(j.data.dstAmount)) / 10 ** dstToken.decimals;
              if (tiny && needIn) {
                const rateBig = bigOut / needIn;
                const rateTiny = tiny / (Math.pow(10, -Math.min(6, srcToken.decimals)) * 10);
                const imp = Math.max(0, 1 - rateBig / rateTiny);
                setImpact(imp);
              }
            }
          }
        }
      } catch (e: any) {
        setQuote({ ok: false, error: e?.message || String(e) });
        setQuoteErr(e?.message || String(e));
      } finally {
        setQuoting(false);
      }
    }, 220);
  }, [
    editSide,
    chainId,
    srcToken?.address,
    dstToken?.address,
    amountIn,
    amountOut,
    srcToken?.decimals,
    dstToken?.decimals,
  ]);

  /* USD reflections */
  useEffect(() => {
    (async () => {
      try {
        if (!srcToken || !dstToken || !tokens) {
          setPayUsd(null);
          setRecvUsd(null);
          return;
        }
        const usdc = pickUSDC(tokens);
        if (!usdc) {
          setPayUsd(null);
          setRecvUsd(null);
          return;
        }

        if (editSide === "src") {
          const ain = Number(amountIn || "0");
          if (!ain) {
            setPayUsd(0);
            setRecvUsd(0);
            return;
          }
          const srcUsd = await tokenUsdPrice(chainId, srcToken, usdc);
          const outTokens =
            quote && "ok" in quote && quote.ok
              ? Number(quote.data.dstAmount) / 10 ** dstToken.decimals
              : 0;
          const dstUsd = await tokenUsdPrice(chainId, dstToken, usdc);

          setPayUsd(srcUsd != null ? ain * srcUsd : null);
          setRecvUsd(dstUsd != null ? outTokens * dstUsd : null);
        } else {
          const aout = Number(amountOut || "0");
          if (!aout) {
            setRecvUsd(0);
            setPayUsd(0);
            return;
          }
          const dstUsd = await tokenUsdPrice(chainId, dstToken, usdc);
          const needIn = Number(computedInFromOut || "0");
          const srcUsd = await tokenUsdPrice(chainId, srcToken, usdc);

          setRecvUsd(dstUsd != null ? aout * dstUsd : null);
          setPayUsd(srcUsd != null ? needIn * srcUsd : null);
        }
      } catch {
        setPayUsd(null);
        setRecvUsd(null);
      }
    })();
  }, [
    chainId,
    tokens,
    srcToken?.address,
    dstToken?.address,
    editSide,
    amountIn,
    amountOut,
    computedInFromOut,
    quote,
  ]);

  /* Balances */
  useEffect(() => {
    (async () => {
      try {
        if (!account || !srcToken) return setSrcBal(null);
        try {
          await ensureChain(chainId);
        } catch {}
        const bal = await readTokenBalance(account, srcToken);
        setSrcBal(bal);
      } catch {
        setSrcBal(null);
      }
    })();
  }, [account, chainId, srcToken?.address]);

  useEffect(() => {
    (async () => {
      try {
        if (!account || !dstToken) return setDstBal(null);
        try {
          await ensureChain(chainId);
        } catch {}
        const bal = await readTokenBalance(account, dstToken);
        setDstBal(bal);
      } catch {
        setDstBal(null);
      }
    })();
  }, [account, chainId, dstToken?.address]);

  /* Swap (allowance-aware, tolerant to API styles) */
  async function onSwap() {
    if (!account) return alert("Connect wallet first");
    if (!srcToken || !dstToken) return alert("Pick both tokens");
    const eth = (window as any).ethereum;
    if (!eth) return alert("MetaMask not found");

    try {
      await ensureChain(chainId);
    } catch (e: any) {
      return alert(e?.message || "Please switch your wallet to the selected network.");
    }

    const toHex = (val: any): string | undefined => {
      if (val == null) return undefined;
      if (typeof val === "object") {
        if (typeof (val as any).hex === "string") return (val as any).hex;
        if (typeof (val as any)._hex === "string") return (val as any)._hex;
        if (typeof (val as any).toHexString === "function")
          return (val as any).toHexString();
        if (typeof (val as any).toString === "function") {
          try {
            const s = (val as any).toString();
            if (/^0x[0-9a-f]+$/i.test(s)) return s;
            if (/^\d+$/i.test(s)) return "0x" + BigInt(s).toString(16);
          } catch {}
        }
      }
      if (typeof val === "string") {
        const s = String(val);
        if (/^0x/i.test(s)) return s;
        if (/^\d+$/i.test(s)) return "0x" + BigInt(s).toString(16);
        const n = Number(s);
        if (Number.isFinite(n)) return "0x" + BigInt(Math.trunc(Math.max(0, n))).toString(16);
        return undefined;
      }
      if (typeof val === "number") return "0x" + Math.trunc(Math.max(0, val)).toString(16);
      if (typeof val === "bigint") return "0x" + val.toString(16);
      return undefined;
    };

    const extractSpender = (obj: any): string | null => {
      const s =
        obj?.data?.spender ||
        obj?.data?.allowanceTarget ||
        obj?.spender ||
        obj?.allowanceTarget ||
        null;
      if (s && /^0x[a-fA-F0-9]{40}$/.test(s)) return s;
      const text =
        typeof obj?.error === "string" ? obj.error :
        typeof obj === "string" ? obj : "";
      const m = String(text).match(/0x[a-fA-F0-9]{40}/);
      return m ? m[0] : null;
    };
    const containsAllowanceError = (j: any, raw: string) =>
      /Not enough allowance/i.test(j?.error || "") || /Not enough allowance/i.test(raw || "");

    const srcAmt = editSide === "src" ? amountIn : computedInFromOut;
    const needUnits = toUnits(srcAmt || "0", srcToken.decimals);

    const build = async () => {
      const r = await fetch("/api/oneinch/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId,
          from: account,
          src: srcToken.address,
          dst: dstToken.address,
          amount: needUnits,
          slippageBps: bps,
        }),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch {}
      return { ok: r.ok, json: j, raw: txt };
    };

    const doApprove = async (spndr: string) => {
      let allowance = await readAllowance(account!, spndr, srcToken!);
      if (allowance >= BigInt(needUnits)) return true;
      const txHash = await approveUnlimited(chainId, account!, srcToken!, spndr);
      if (!txHash) return false;
      const start = Date.now();
      while (Date.now() - start < 30000) {
        await new Promise((r) => setTimeout(r, 2000));
        allowance = await readAllowance(account!, spndr, srcToken!);
        if (allowance >= BigInt(needUnits)) return true;
      }
      return false;
    };

    // 1) try build
    let first = await build();

    // 2) Handle allowance regardless of HTTP code style
    if (!first.ok || containsAllowanceError(first.json, first.raw)) {
      const spenderFromError = extractSpender(first.json) || extractSpender(first.raw);
      const fallbackSpender = spender && isAddress(spender) ? spender : await getSpender(chainId);
      const spenderToUse = spenderFromError || fallbackSpender;

      const isNative = srcToken.address.toLowerCase() === NATIVE.toLowerCase();
      if (!isNative && spenderToUse) {
        const ok = await doApprove(spenderToUse);
        if (!ok) {
          return alert(
            `Approve submitted but not confirmed yet.\nPlease wait a moment, then press Swap again.`
          );
        }
        first = await build();
      }
    }

    if (!first.ok) {
      const msg =
        first?.json?.error ||
        first?.json?.data?.description ||
        `Swap build failed (${first.raw?.slice(0, 200) || "unknown error"})`;
      return alert(msg);
    }

    const payload = first.json?.data?.tx || first.json?.data;
    if (!payload?.to || !payload?.data) {
      return alert("Swap build returned an invalid transaction payload.");
    }

    const txParams: any = {
      from: account,
      to: payload.to,
      data: payload.data,
      value: toHex(payload.value) ?? "0x0",
    };
    const gas = toHex(payload.gas);
    const gasPrice = toHex(payload.gasPrice);
    const maxFeePerGas = toHex(payload.maxFeePerGas);
    const maxPriorityFeePerGas = toHex(payload.maxPriorityFeePerGas);
    if (gas) txParams.gas = gas;
    if (gasPrice) txParams.gasPrice = gasPrice;
    if (maxFeePerGas) txParams.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = maxPriorityFeePerGas;

    try {
      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });
      alert("Transaction submitted: " + txHash);
    } catch (e: any) {
      alert(e?.message || JSON.stringify(e));
    }
  }

  /* Derived values */
  const toAmount = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok) return "0.000000";
    const out =
      Number(quote.data.dstAmount) / 10 ** (quote.data.dstToken.decimals || 6);
    return out.toFixed(6);
  }, [quote]);

  const rateText = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok || !srcToken || !dstToken)
      return "—";
    const aIn = Number(
      (editSide === "src" ? amountIn : computedInFromOut) || "0"
    );
    const out = Number(quote.data.dstAmount) / 10 ** dstToken.decimals;
    return aIn ? `${fmt(out / aIn, 6)} ${dstToken.symbol} per ${srcToken.symbol}` : "—";
  }, [quote, amountIn, computedInFromOut, editSide, srcToken, dstToken]);

  /* UI Bits */
  const onMaxSrc = () => {
    if (srcBal == null || !srcToken) return;
    let max = srcBal;
    const isNat = srcToken.address.toLowerCase() === NATIVE.toLowerCase();
    if (isNat) max = Math.max(0, max - 0.0003);
    setEditSide("src");
    setAmountIn(max > 0 ? String(Number(max.toFixed(6))) : "0");
  };
  // “Receive” max just mirrors “pay” max for convenience
  const onMaxDst = () => onMaxSrc();

  const onFlip = () => {
    const a = srcToken;
    const b = dstToken;
    setSrcToken(b);
    setDstToken(a);
  };

  const payInputValue =
    editSide === "src"
      ? amountIn
      : computedInFromOut
      ? String(Number(computedInFromOut))
      : "";
  const recvInputValue = editSide === "src" ? toAmount : amountOut;

  /* ============ RENDER ============ */

  return (
    <div className="wrap">
      {/* Header with logo */}
      <div className="top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand" src="/logo.png" alt="PCW" />
        <div className="brandTxt">PCW Swap</div>
      </div>

      <div className="card">
        <div className="head">
          <div className="left">
            <select
              className="sel"
              value={chainId}
              onChange={(e) => setChainId(Number(e.target.value))}
              title="Network"
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (id {c.id})
                </option>
              ))}
            </select>
          </div>

          <div className="right">
            {account ? (
              <>
                <span className="pill green">{short(account)}</span>
                <button className="link" onClick={disconnect}>
                  Disconnect
                </button>
              </>
            ) : (
              <button className="btn" onClick={connect}>
                Connect
              </button>
            )}
          </div>
        </div>

        {/* You pay */}
        <label className="lbl">You pay</label>
        <div className="row">
          <button className="token" onClick={() => setPickSrcOpen(true)}>
            {srcToken?.logoURI ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={srcToken.logoURI} alt="" />
            ) : (
              <span className="dot" />
            )}
            <span>{srcToken?.symbol || "Select"}</span>
          </button>

          <div className="amtBox">
            <div className="amtCol">
              <input
                className="amt"
                value={payInputValue}
                inputMode="decimal"
                onFocus={() => setEditSide("src")}
                onChange={(e) =>
                  setAmountIn(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="0.0"
              />
              <div className="fiat">
                {payUsd != null ? `~$${fmt(payUsd, 2)}` : "—"}
              </div>
            </div>
            <button className="max" onClick={onMaxSrc}>
              MAX
            </button>
          </div>
        </div>
        <div className="metaRow">
          <div className="usd">{payUsd != null ? `$${fmt(payUsd, 2)}` : "—"}</div>
          <div className="bal">
            Balance: {srcBal != null ? fmt(srcBal, 6) : "—"}
          </div>
        </div>

        {/* centered flip */}
        <div className="flip-wrap">
          <button className="flip" onClick={onFlip} aria-label="Flip">
            ↑↓
          </button>
        </div>

        {/* You receive */}
        <label className="lbl">You receive</label>
        <div className="row">
          <button className="token" onClick={() => setPickDstOpen(true)}>
            {dstToken?.logoURI ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dstToken.logoURI} alt="" />
            ) : (
              <span className="dot" />
            )}
            <span>{dstToken?.symbol || "Select"}</span>
          </button>

          <div className="amtBox">
            <div className="amtCol">
              <input
                className="amt"
                value={recvInputValue}
                inputMode="decimal"
                onFocus={() => setEditSide("dst")}
                onChange={(e) =>
                  setAmountOut(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="0.0"
              />
              <div className="fiat">
                {recvUsd != null ? `~$${fmt(recvUsd, 2)}` : "—"}
              </div>
            </div>
            <button className="max" onClick={onMaxDst}>
              MAX
            </button>
          </div>
        </div>
        <div className="metaRow">
          <div className="usd">{recvUsd != null ? `$${fmt(recvUsd, 2)}` : "—"}</div>
          <div className="bal">
            Balance: {dstBal != null ? fmt(dstBal, 6) : "—"}
          </div>
        </div>

        {/* Slippage */}
        <div className="slip">
          <span className="muted">Slippage</span>
          <div className="chips">
            <button
              className={`chip ${slipMode === "slow" ? "on" : ""}`}
              onClick={() => setSlipMode("slow")}
            >
              Slow
            </button>
            <button
              className={`chip ${slipMode === "market" ? "on" : ""}`}
              onClick={() => setSlipMode("market")}
            >
              Market
            </button>
            <button
              className={`chip ${slipMode === "fast" ? "on" : ""}`}
              onClick={() => setSlipMode("fast")}
            >
              Fast
            </button>
            <div className="custom">
              <button
                className={`chip ${slipMode === "custom" ? "on" : ""}`}
                onClick={() => setSlipMode("custom")}
              >
                custom %
              </button>
              <input
                value={customSlip}
                placeholder={(bps / 100).toString()}
                onChange={(e) =>
                  setCustomSlip(e.target.value.replace(/[^\d.]/g, ""))
                }
              />
            </div>
          </div>
        </div>

        <div className="meta">
          <div className="muted">{rateText}</div>
          <div className="muted">
            Price impact:&nbsp;
            {impact == null ? "—" : `${(impact * 100).toFixed(2)}%`}
          </div>
        </div>

        {quoteErr && <div className="err">Quote error: {quoteErr}</div>}

        <button
          className="swap"
          onClick={onSwap}
          disabled={!srcToken || !dstToken || quoting}
        >
          Swap
        </button>
      </div>

      {/* Pickers */}
      <TokenPicker
        open={pickSrcOpen}
        onClose={() => setPickSrcOpen(false)}
        onPick={onPickSrc}
        tokens={tokens}
        chainId={chainId}
      />
      <TokenPicker
        open={pickDstOpen}
        onClose={() => setPickDstOpen(false)}
        onPick={onPickDst}
        tokens={tokens}
        chainId={chainId}
      />

      {/* Styles */}
      <style jsx>{`
        :global(html) {
          --pcw-text: #e6eaf2;
          --pcw-muted: #a8b4c9;
          --pcw-card: #0b152b;
          --pcw-stroke: #1d2a44;
        }
        .wrap {
          min-height: 100dvh;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 18px;
          /* Brighter Solana-like gradient */
          background:
            radial-gradient(1200px 700px at 65% -10%, rgba(22, 255, 199, 0.20) 0%, rgba(9, 18, 35, 0.0) 55%),
            radial-gradient(900px 600px at 15% 10%, rgba(124, 58, 237, 0.25) 0%, rgba(9, 18, 35, 0.0) 60%),
            radial-gradient(1000px 700px at 85% 80%, rgba(20, 241, 149, 0.18) 0%, rgba(9, 18, 35, 0.0) 65%),
            linear-gradient(180deg, #0a1326 0%, #0a142a 40%, #0a1224 100%);
          padding: 28px 18px 36px;
        }
        .top {
          display:flex; align-items:center; gap:10px;
          max-width: 980px; width:100%; margin: 0 auto;
        }
        .brand { width:30px; height:30px; border-radius:8px; }
        .brandTxt { font-weight:800; color:#fff; opacity:0.9; }

        .card {
          width: 560px;
          max-width: calc(100% - 24px);
          margin: 0 auto;
          color: var(--pcw-text);
          background: var(--pcw-card);
          border: 1px solid var(--pcw-stroke);
          border-radius: 16px;
          padding: 20px;
          backdrop-filter: blur(10px);
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .sel,
        .btn,
        .link {
          border: 1px solid var(--pcw-stroke);
          border-radius: 10px;
          background: #0f1b34;
          color: var(--pcw-text);
          padding: 6px 10px;
          font-size: 13px;
        }
        .link {
          background: transparent;
          border-color: transparent;
          color: #9fd6ff;
          cursor: pointer;
        }
        .pill {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #18d29f44;
          background: #18d29f1a;
          color: #14f195;
        }
        .lbl {
          display: block;
          font-size: 12px;
          color: var(--pcw-muted);
          margin-top: 12px;
          margin-bottom: 6px;
        }
        .row {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: center;
          border: 1px solid var(--pcw-stroke);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.02);
        }
        .token {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          color: var(--pcw-text);
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .token img { width: 20px; height: 20px; border-radius: 999px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #64748b; display: inline-block; }

        .amtBox { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        .amt {
          text-align: right; font-size: 18px; border: none; outline: none; background: transparent; color: var(--pcw-text);
        }
        .amt::placeholder { color: #7f8aa3; }
        .max {
          border: 1px solid var(--pcw-stroke);
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--pcw-text);
        }
        .amtCol { display: flex; flex-direction: column; align-items: flex-end; }
        .fiat { font-size: 12px; line-height: 1.1; margin-top: 2px; color: #94a3b8; }

        .metaRow { display: flex; justify-content: space-between; margin-top: 4px; }
        .usd, .bal { font-size: 12px; color: var(--pcw-muted); }

        .flip-wrap { display:flex; justify-content:center; align-items:center; margin: 8px 0 10px; }
        .flip {
          width: 30px; height: 30px;
          display:inline-flex; align-items:center; justify-content:center;
          border-radius:999px; border:1px solid var(--pcw-stroke);
          background:#0f1b34; box-shadow:0 2px 10px rgba(0,0,0,0.25);
          cursor:pointer; font-weight:700; line-height:1; color: var(--pcw-text);
        }
        .flip:hover { background:#132449; }

        .slip { display:flex; justify-content:space-between; align-items:center; margin-top: 14px; }
        .chips { display:flex; gap:8px; align-items:center; }
        .chip {
          border: 1px solid #2c3a58; background: transparent; color: #a8b4c9;
          border-radius: 999px; padding: 6px 10px; font-size: 12px;
        }
        .chip.on {
          color: #06161c;
          background: linear-gradient(90deg, #7c3aed, #06b6d4 60%, #14f195);
          border-color: transparent;
          box-shadow: 0 0 20px rgba(20, 241, 149, 0.25), 0 0 8px rgba(6, 182, 212, 0.3);
        }
        .custom { display:flex; align-items:center; gap:6px; }
        .custom input {
          width: 60px; border: 1px solid var(--pcw-stroke); border-radius:8px; padding: 6px 8px;
          text-align:right; font-size:12px; color: var(--pcw-text); background:#0f1b34;
        }

        .meta { display:flex; justify-content:space-between; font-size:12px; margin-top: 8px; }
        .muted { color: var(--pcw-muted); }
        .err { margin-top: 8px; color: #ff6b6b; font-size: 13px; }

        .swap {
          width: 100%; margin-top: 14px;
          background: linear-gradient(90deg, #7c3aed, #06b6d4 60%, #14f195);
          color: #06161c; border: none; border-radius: 12px; padding: 12px; font-weight: 800;
          cursor: pointer; box-shadow: 0 10px 25px rgba(20, 241, 149, 0.2);
        }
        .swap:hover { filter: brightness(1.05); }
        .swap:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
