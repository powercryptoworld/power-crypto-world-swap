"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------------- Types ---------------- */
type Token = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
};
type TokensByAddr = Record<string, Token>;

type QuoteOk = { ok: true; data: { dstAmount: string; srcToken: Token; dstToken: Token } };
type QuoteFail = { ok: false; error: string };
type QuoteResponse = QuoteOk | QuoteFail;

type SwapBuildOk = { ok: true; data: { tx?: { to: string; from?: string; data: string; value?: any; gas?: any; gasPrice?: any; maxFeePerGas?: any; maxPriorityFeePerGas?: any } } };
type SwapBuildFail = { ok: false; error: string };
type SwapBuildResponse = SwapBuildOk | SwapBuildFail;

/* --------------- Consts --------------- */
const fmt = (n: number, d = 6) => new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
const short = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

/** 1inch native placeholder (exact) */
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Chains shown (add more later as needed) */
const CHAINS: { id: number; name: string }[] = [
  { id: 1, name: "Ethereum" },
  { id: 56, name: "BNB Chain" },
  { id: 137, name: "Polygon" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 8453, name: "Base" },
  { id: 43114, name: "Avalanche" },
  { id: 324, name: "zkSync Era" },
  { id: 59144, name: "Linea" },
  { id: 100, name: "Gnosis" },
  { id: 250, name: "Fantom" },
];

/** Per-chain native symbol priorities */
const NATIVE_PRIORITIES: Record<number, string[]> = {
  1: ["ETH", "WETH"],
  42161: ["ETH", "WETH"],
  10: ["ETH", "WETH"],
  8453: ["ETH", "WETH"],
  324: ["ETH", "WETH"],
  59144: ["ETH", "WETH"],
  56: ["BNB", "WBNB"],
  137: ["MATIC", "WMATIC", "POL", "WPOL"],
  43114: ["AVAX", "WAVAX"],
  250: ["FTM", "WFTM"],
  100: ["XDAI", "WXDAI", "GNO", "WGNO"],
};

/* Helpers for native detection/normalization */
function isNativeSymbol(chainId: number, sym?: string) {
  if (!sym) return false;
  const wanted = NATIVE_PRIORITIES[chainId] || [];
  return wanted.includes(sym.toUpperCase());
}
function asNativeToken(chainId: number, base?: Token): Token | undefined {
  if (!base) return undefined;
  return {
    address: NATIVE,           // force native placeholder address
    symbol: base.symbol,
    name: base.name || base.symbol,
    decimals: 18,              // native is 18
    logoURI: base.logoURI,
  };
}

/* ------------- Token Picker ------------- */
function TokenPicker({
  open, onClose, tokens, onSelect,
}: { open: boolean; onClose: () => void; tokens?: TokensByAddr; onSelect: (t: Token) => void; }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!tokens) return [];
    const arr = Object.values(tokens);
    if (!q.trim()) return arr.slice(0, 400);
    const s = q.trim().toLowerCase();
    return arr
      .filter(
        (t) =>
          t.symbol?.toLowerCase().includes(s) ||
          t.name?.toLowerCase().includes(s) ||
          t.address?.toLowerCase() === s
      )
      .slice(0, 400);
  }, [tokens, q]);

  if (!open) return null;
  return (
    <div className="picker-wrap" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-top">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / symbol / address…" />
          <button onClick={onClose}>Close</button>
        </div>
        <div className="picker-list">
          {tokens ? (
            list.length ? (
              list.map((t) => (
                <button key={t.address + t.symbol} className="picker-row" onClick={() => (onSelect(t), onClose())}>
                  <div className="logo">
                    {t.logoURI ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoURI} alt={t.symbol} />
                    ) : (
                      <span className="dot" />
                    )}
                  </div>
                  <div className="pick-main">
                    <div className="pick-symbol">{t.symbol}</div>
                    <div className="pick-name">{t.name}</div>
                  </div>
                  <div className="pick-addr">{short(t.address)}</div>
                </button>
              ))
            ) : (
              <div className="picker-empty">No results.</div>
            )
          ) : (
            <div className="picker-empty">Loading tokens…</div>
          )}
        </div>
      </div>

      <style jsx>{`
        .picker-wrap { position: fixed; inset: 0; background: rgba(0,0,0,.4); display:flex; align-items:flex-start; justify-content:center; padding-top:10vh; z-index:50; }
        .picker { width:520px; max-width:92vw; background:#fff; border:1px solid #e6e8eb; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.12); overflow:hidden; }
        .picker-top { display:flex; gap:8px; padding:12px; border-bottom:1px solid #eef0f2; }
        .picker-top input { flex:1; border:1px solid #e6e8eb; border-radius:10px; padding:10px 12px; }
        .picker-list { max-height:60vh; overflow:auto; }
        .picker-row { width:100%; display:grid; grid-template-columns:32px 1fr auto; gap:10px; align-items:center; padding:10px 12px; border-bottom:1px solid #f3f5f7; text-align:left; }
        .picker-row:hover { background:#f9f9fb; }
        .logo img { width:28px; height:28px; border-radius:50%; }
        .dot { width:10px; height:10px; background:#c4c9cf; border-radius:50%; display:inline-block; }
        .pick-symbol { font-weight:600; }
        .pick-name { font-size:12px; color:#6b7280; }
        .pick-addr { font-size:11px; color:#9aa1a9; }
        .picker-empty { padding:16px; color:#6b7280; font-size:14px; }
      `}</style>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Page() {
  // wallet
  const [account, setAccount] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [chainId, setChainId] = useState<number>(1);

  // tokens
  const [tokens, setTokens] = useState<TokensByAddr | undefined>(undefined);
  const [srcToken, setSrcToken] = useState<Token | undefined>(undefined);
  const [dstToken, setDstToken] = useState<Token | undefined>(undefined);
  const [pickSrcOpen, setPickSrcOpen] = useState(false);
  const [pickDstOpen, setPickDstOpen] = useState(false);

  // swap state
  const [amountIn, setAmountIn] = useState<string>("0.01");
  const [slipMode, setSlipMode] = useState<"slow" | "market" | "fast" | "custom">("market");
  const [customSlip, setCustomSlip] = useState<string>("");

  // quote + USD
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [payUsd, setPayUsd] = useState<number | null>(null);
  const [recvUsd, setRecvUsd] = useState<number | null>(null);

  const debounceRef = useRef<number | null>(null);
  const bps = useMemo(
    () =>
      slipMode === "slow" ? 10 : slipMode === "fast" ? 50 : slipMode === "custom" ? Math.round(Math.max(0, Number(customSlip || "0")) * 100) : 25,
    [slipMode, customSlip]
  );

  /* ---- wallet ---- */
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
    eth.on?.("chainChanged", (hex: string) => setWalletChainId(parseInt(hex, 16) || null));
  }
  function disconnect() { setAccount(null); }

  // ask wallet to switch when UI chain changes
  useEffect(() => {
    (async () => {
      const eth = (window as any).ethereum;
      if (!eth || walletChainId == null || walletChainId === chainId) return;
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + chainId.toString(16) }] });
      } catch {}
    })();
  }, [chainId, walletChainId]);

  /* ---- tokens fetch ---- */
  async function fetchTokens(cid: number): Promise<TokensByAddr> {
    const r = await fetch(`/api/oneinch/tokens?chainId=${cid}`);
    const j = await r.json();
    let map: TokensByAddr | undefined = j?.tokens || j?.data?.tokens;
    if (!map && Array.isArray(j)) {
      map = {};
      (j as any[]).forEach((t: any) => (map![String(t.address).toLowerCase()] = t));
    }
    if (!map) map = {};
    // normalize + lowercase keys
    const norm: TokensByAddr = {};
    for (const [kRaw, tRaw] of Object.entries(map)) {
      const k = kRaw.toLowerCase();
      const t: any = { ...tRaw };
      t.address = String(t.address);
      if (!t.logoURI) t.logoURI = t.logoUrl || t.logo || t.icon || undefined;
      norm[k] = t as Token;
    }
    return norm;
  }

  function pickNative(map: TokensByAddr): Token | undefined {
    const vals = Object.values(map);
    if (map[NATIVE.toLowerCase()]) return asNativeToken(chainId, map[NATIVE.toLowerCase()]);
    const wanted = NATIVE_PRIORITIES[chainId] || [];
    for (const sym of wanted) {
      const hit = vals.find((t) => (t.symbol || "").toUpperCase() === sym);
      if (hit) return asNativeToken(chainId, hit);
    }
    const fuzzy = vals.find((t) => /eth|weth|bnb|wbnb|matic|wmatic|avax|wavax|ftm|wftm|xdai|wxdai|gno|wgno/i.test((t.symbol || "") + " " + (t.name || "")));
    return fuzzy ? asNativeToken(chainId, fuzzy) : undefined;
  }
  function pickUSDC(map: TokensByAddr): Token | undefined {
    const vals = Object.values(map);
    return (
      vals.find((t) => (t.symbol || "").toUpperCase() === "USDC" && t.decimals === 6) ||
      vals.find((t) => (t.symbol || "").toUpperCase() === "USDC") ||
      vals.find((t) => (t.name || "").toLowerCase().includes("usd coin")) ||
      vals[1]
    );
  }

  useEffect(() => {
    let stop = false;
    setTokens(undefined);
    setSrcToken(undefined);
    setDstToken(undefined);
    (async () => {
      try {
        const map = await fetchTokens(chainId);
        if (stop) return;
        setTokens(map);
        setSrcToken(pickNative(map) || Object.values(map)[0]);
        setDstToken(pickUSDC(map) || Object.values(map)[1]);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { stop = true; };
  }, [chainId]);

  function onPickSrc(t: Token) {
    if (isNativeSymbol(chainId, t.symbol) || t.address.toLowerCase() === NATIVE.toLowerCase()) {
      const nat = asNativeToken(chainId, t);
      if (nat) setSrcToken(nat);
      else setSrcToken(t);
    } else {
      setSrcToken(t);
    }
  }
  function onPickDst(t: Token) { setDstToken(t); }

  /* ---- main quote ---- */
  useEffect(() => {
    if (!srcToken || !dstToken) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setQuoting(true); setQuoteErr(null);
      try {
        const body = { chainId, src: srcToken.address, dst: dstToken.address, amount: toUnits(amountIn || "0", srcToken.decimals) };
        const r = await fetch("/api/oneinch/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = (await r.json()) as QuoteResponse;
        setQuote(j);
        if (!j.ok) setQuoteErr(j.error || "quote failed");
      } catch (e: any) {
        setQuote(null); setQuoteErr(e?.message || String(e));
      } finally { setQuoting(false); }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, srcToken?.address, dstToken?.address, amountIn]);

  /* ---- $ reflections ---- */
  useEffect(() => {
    // pay
    (async () => {
      try {
        if (!srcToken || !dstToken || !amountIn) return setPayUsd(null);
        if ((srcToken.symbol || "").toUpperCase() === "USDC") return setPayUsd(Number(amountIn));
        const r = await fetch("/api/oneinch/quote", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chainId, src: srcToken.address, dst: dstToken.address, amount: toUnits(amountIn, srcToken.decimals) }),
        });
        const j = (await r.json()) as QuoteResponse;
        if ((j as QuoteOk).ok) {
          const out = Number((j as QuoteOk).data.dstAmount) / 10 ** (dstToken.decimals || 6);
          setPayUsd(out);
        } else setPayUsd(null);
      } catch { setPayUsd(null); }
    })();

    // receive
    (async () => {
      try {
        if (!dstToken || !quote || !("ok" in quote) || !quote.ok) return setRecvUsd(null);
        const out = Number(quote.data.dstAmount) / 10 ** (dstToken.decimals || 6);
        setRecvUsd(out || null);
      } catch { setRecvUsd(null); }
    })();
  }, [chainId, srcToken, dstToken, amountIn, quote]);

  /* ---- Build + Send (robust hex) ---- */
  async function onSwap() {
    if (!account) return alert("Connect wallet first");
    if (!srcToken || !dstToken) return alert("Pick both tokens");

    const eth = (window as any).ethereum;
    if (!eth) return alert("MetaMask not found");

    // Ensure wallet network
    try {
      const hexId: string = await eth.request({ method: "eth_chainId" });
      const id = parseInt(hexId, 16);
      if (id !== chainId) {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + chainId.toString(16) }],
        });
      }
    } catch {
      return alert("Please switch your wallet to the selected network and try again.");
    }

    // helper: normalize anything to 0x-hex
    const toHex = (val: any): string | undefined => {
      if (val == null) return undefined;

      if (typeof val === "object") {
        if (typeof val.hex === "string") return val.hex;                 // viem
        if (typeof (val as any)._hex === "string") return (val as any)._hex; // ethers v5
        if (typeof (val as any).toHexString === "function") return (val as any).toHexString();
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

    try {
      // build
      const body = {
        chainId,
        from: account,
        src: srcToken.address,
        dst: dstToken.address,
        amount: toUnits(amountIn || "0", srcToken.decimals),
        slippageBps: bps,
      };

      const r = await fetch("/api/oneinch/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as SwapBuildResponse;
      if (!j.ok || !j.data?.tx) {
        return alert((j as any)?.error || "Swap build failed");
      }

      // clean tx
      const raw: any = j.data.tx;
      const txParams: any = {
        from: account,
        to: raw.to,
        data: raw.data,
        value: toHex(raw.value) ?? "0x0",
      };
      const gas = toHex(raw.gas);
      const gasPrice = toHex(raw.gasPrice);
      const maxFeePerGas = toHex(raw.maxFeePerGas);
      const maxPriorityFeePerGas = toHex(raw.maxPriorityFeePerGas);
      if (gas) txParams.gas = gas;
      if (gasPrice) txParams.gasPrice = gasPrice;
      if (maxFeePerGas) txParams.maxFeePerGas = maxFeePerGas;
      if (maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = maxPriorityFeePerGas;

      // send
      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });
      alert("Transaction submitted: " + txHash);
    } catch (e: any) {
      alert(e?.message || JSON.stringify(e));
    }
  }

  /* ---- UI helpers ---- */
  const toAmount = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok) return "0.000000";
    const out = Number(quote.data.dstAmount) / 10 ** (quote.data.dstToken.decimals || 6);
    return out.toFixed(6);
  }, [quote]);

  const rateText = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok || !srcToken || !dstToken) return "—";
    const aIn = Number(amountIn || "0");
    const out = Number(quote.data.dstAmount) / 10 ** dstToken.decimals;
    return aIn ? `${fmt(out / aIn, 6)} ${dstToken.symbol} per ${srcToken.symbol}` : "—";
  }, [quote, amountIn, srcToken, dstToken]);

  return (
    <div className="wrap">
      <div className="card">
        {/* top */}
        <div className="head">
          <div className="title">PCW Swap</div>
          <div className="right">
            <select className="sel" value={chainId} onChange={(e) => setChainId(Number(e.target.value))} title="Network">
              {CHAINS.map((c) => (<option key={c.id} value={c.id}>{c.name} (id {c.id})</option>))}
            </select>
            {account ? (
              <>
                <span className="pill green">{short(account)}</span>
                <button className="link" onClick={disconnect}>Disconnect</button>
              </>
            ) : (
              <button className="btn" onClick={connect}>Connect</button>
            )}
          </div>
        </div>

        {/* You pay */}
        <label className="lbl">You pay</label>
        <div className="row">
          <button className="token" onClick={() => setPickSrcOpen(true)}>
            {srcToken?.logoURI ? <img src={srcToken.logoURI} alt="" /> : <span className="dot" />}
            <span>{srcToken?.symbol || "Select"}</span>
          </button>
          <input className="amt" value={amountIn} inputMode="decimal" onChange={(e) => setAmountIn(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.0" />
        </div>
        <div className="usd">{payUsd != null ? `$${fmt(payUsd, 2)}` : "—"}</div>

        {/* You receive */}
        <label className="lbl">You receive</label>
        <div className="row">
          <button className="token" onClick={() => setPickDstOpen(true)}>
            {dstToken?.logoURI ? <img src={dstToken.logoURI} alt="" /> : <span className="dot" />}
            <span>{dstToken?.symbol || "Select"}</span>
          </button>
          <div className="amt ro">{quoting ? "…" : toAmount}</div>
        </div>
        <div className="usd">{recvUsd != null ? `$${fmt(recvUsd, 2)}` : "—"}</div>

        {/* Slippage */}
        <div className="slip">
          <span className="muted">Slippage</span>
          <div className="chips">
            <button className={`chip ${slipMode === "slow" ? "on" : ""}`} onClick={() => setSlipMode("slow")}>Slow</button>
            <button className={`chip ${slipMode === "market" ? "on" : ""}`} onClick={() => setSlipMode("market")}>Market</button>
            <button className={`chip ${slipMode === "fast" ? "on" : ""}`} onClick={() => setSlipMode("fast")}>Fast</button>
            <div className="custom">
              <button className={`chip ${slipMode === "custom" ? "on" : ""}`} onClick={() => setSlipMode("custom")}>custom %</button>
              <input value={customSlip} placeholder={(bps / 100).toString()} onChange={(e) => setCustomSlip(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="meta">
          <div className="muted">{rateText}</div>
          <div className="muted">Est. network fee: –</div>
        </div>

        {/* Errors */}
        {quoteErr && <div className="err">Quote error: {quoteErr}</div>}

        {/* Swap */}
        <button className="swap" onClick={onSwap} disabled={!srcToken || !dstToken || !amountIn || quoting}>Swap</button>
      </div>

      {/* Pickers */}
      <TokenPicker open={pickSrcOpen} onClose={() => setPickSrcOpen(false)} tokens={tokens} onSelect={onPickSrc} />
      <TokenPicker open={pickDstOpen} onClose={() => setPickDstOpen(false)} tokens={tokens} onSelect={onPickDst} />

      <style jsx>{`
        .wrap { display:grid; place-items:center; min-height:100dvh; background:#fafbfc; padding:24px; }
        .card { width:560px; max-width:100%; background:#fff; border:1px solid #e6e8eb; border-radius:16px; padding:20px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
        .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
        .title { font-weight:700; font-size:20px; }
        .right { display:flex; gap:8px; align-items:center; }
        .sel { border:1px solid #d7dbdf; border-radius:10px; padding:6px 8px; font-size:13px; }
        .pill { display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid #d7dbdf; background:#f3f5f7; }
        .green { background:#e9f9f0; border-color:#b9efd3; }
        .btn, .link { border:1px solid #d7dbdf; border-radius:10px; background:#f6f8fa; padding:6px 10px; font-size:13px; }
        .link { background:transparent; border:none; color:#006adc; cursor:pointer; }
        .lbl { display:block; font-size:12px; color:#6b7280; margin-top:12px; margin-bottom:6px; }
        .row { display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:center; border:1px solid #e6e8eb; border-radius:12px; padding:10px 12px; }
        .token { display:flex; align-items:center; gap:8px; font-weight:600; background:transparent; border:none; cursor:pointer; }
        .token img { width:20px; height:20px; border-radius:999px; }
        .dot { width:10px; height:10px; border-radius:50%; background:#c4c9cf; display:inline-block; }
        .amt { text-align:right; font-size:18px; border:none; outline:none; }
        .amt.ro { user-select:none; }
        .usd { font-size:12px; color:#6b7280; text-align:right; margin-top:4px; min-height:16px; }
        .slip { display:flex; justify-content:space-between; align-items:center; margin-top:14px; }
        .chips { display:flex; gap:8px; align-items:center; }
        .chip { border:1px solid #d7dbdf; background:#f6f8fa; border-radius:999px; padding:6px 10px; font-size:12px; }
        .chip.on { background:#0f9d58; color:#fff; border-color:#0f9d58; }
        .custom { display:flex; align-items:center; gap:6px; }
        .custom input { width:60px; border:1px solid #e6e8eb; border-radius:8px; padding:6px 8px; text-align:right; font-size:12px; }
        .meta { display:flex; justify-content:space-between; font-size:12px; margin-top:8px; }
        .muted { color:#6b7280; }
        .err { margin-top:8px; color:#b42318; font-size:13px; }
        .swap { width:100%; margin-top:14px; background:#118a4e; color:#fff; border:none; border-radius:12px; padding:12px; font-weight:700; cursor:pointer; }
        .swap:disabled { opacity:.6; cursor:not-allowed; }
      `}</style>
    </div>
  );
}

/* -------------- utils -------------- */
function toUnits(amount: string, decimals: number): string {
  const [i, f = ""] = (amount || "0").split(".");
  const cleanI = i.replace(/\D/g, "") || "0";
  const cleanF = (f.replace(/\D/g, "") + "0".repeat(decimals)).slice(0, decimals);
  const s = BigInt(cleanI) * BigInt(10) ** BigInt(decimals) + BigInt(cleanF || "0");
  return s.toString();
}
