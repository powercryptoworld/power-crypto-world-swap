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
  };
};
type SwapBuildFail = { ok: false; error: string };
type SwapBuildResponse = SwapBuildOk | SwapBuildFail;

/* --------------- Consts --------------- */
const fmt = (n: number, d = 6) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
const short = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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

/* -------- chain params for add/switch (MetaMask) -------- */
const RPC: Record<number, string[]> = {
  1: ["https://rpc.ankr.com/eth"],
  56: ["https://bsc-dataseed.binance.org/"],
  137: ["https://polygon-rpc.com/"],
  42161: ["https://arb1.arbitrum.io/rpc"],
  10: ["https://mainnet.optimism.io"],
  8453: ["https://mainnet.base.org"],
  43114: ["https://api.avax.network/ext/bc/C/rpc"],
  324: ["https://mainnet.era.zksync.io"],
  59144: ["https://rpc.linea.build"],
  100: ["https://rpc.gnosis.gateway.fm"],
  250: ["https://rpc.ftm.tools/"],
};
const EXPLORER: Record<number, string> = {
  1: "https://etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  8453: "https://basescan.org",
  43114: "https://snowtrace.io",
  324: "https://explorer.zksync.io",
  59144: "https://lineascan.build",
  100: "https://gnosisscan.io",
  250: "https://ftmscan.com",
};
const NATIVE_CCY: Record<number, { name: string; symbol: string; decimals: number }> = {
  1: { name: "Ether", symbol: "ETH", decimals: 18 },
  56: { name: "BNB", symbol: "BNB", decimals: 18 },
  137: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  42161: { name: "Ether", symbol: "ETH", decimals: 18 },
  10: { name: "Ether", symbol: "ETH", decimals: 18 },
  8453: { name: "Ether", symbol: "ETH", decimals: 18 },
  43114: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  324: { name: "Ether", symbol: "ETH", decimals: 18 },
  59144: { name: "Ether", symbol: "ETH", decimals: 18 },
  100: { name: "xDAI", symbol: "XDAI", decimals: 18 },
  250: { name: "FTM", symbol: "FTM", decimals: 18 },
};
async function ensureChain(chainId: number) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  const targetHex = "0x" + chainId.toString(16);
  const current = parseInt(await eth.request({ method: "eth_chainId" }), 16);
  if (current === chainId) return;

  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetHex }] });
  } catch (e: any) {
    if (e?.code === 4902 && RPC[chainId] && NATIVE_CCY[chainId]) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: targetHex,
            chainName: CHAINS.find((c) => c.id === chainId)?.name || `Chain ${chainId}`,
            rpcUrls: RPC[chainId],
            blockExplorerUrls: EXPLORER[chainId] ? [EXPLORER[chainId]] : [],
            nativeCurrency: NATIVE_CCY[chainId],
          },
        ],
      });
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetHex }] });
    } else {
      throw e;
    }
  }
}

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

function isNativeSymbol(chainId: number, sym?: string) {
  if (!sym) return false;
  const wanted = NATIVE_PRIORITIES[chainId] || [];
  return wanted.includes(sym.toUpperCase());
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
const isAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim());

/* ---------- Server API: read ERC-20 meta (works on all EVM chains) ---------- */
async function readErc20MetaViaRpc(chainId: number, address: string): Promise<Token | null> {
  const r = await fetch("/api/erc20meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId, address }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (j?.ok && j?.token) return j.token as Token;
  return null;
}

/* ---------------- Token Picker ---------------- */
function TokenPicker({
  open,
  onClose,
  tokens,
  onSelect,
  onLoadByAddress,
  chainId,
}: {
  open: boolean;
  onClose: () => void;
  tokens?: TokensByAddr;
  onSelect: (t: Token) => void;
  onLoadByAddress: (addr: string) => Promise<void>;
  chainId: number;
}) {
  const [q, setQ] = useState("");
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [customErr, setCustomErr] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!tokens) return [];
    const arr = Object.values(tokens);
    if (!q.trim() || isAddress(q.trim())) return arr.slice(0, 400);
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

  const qIsAddr = isAddress(q.trim());

  // Auto-load by address when pasted
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!qIsAddr) return;
      const addrL = q.trim().toLowerCase();
      if (tokens && tokens[addrL]) {
        onSelect(tokens[addrL]);
        return;
      }
      setLoadingCustom(true);
      setCustomErr(null);
      try {
        await onLoadByAddress(addrL);
        if (!stop) setQ("");
      } catch (e: any) {
        if (!stop) setCustomErr(e?.message || "Failed to load token");
      } finally {
        if (!stop) setLoadingCustom(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [qIsAddr, q, onLoadByAddress, onSelect, tokens]);

  if (!open) return null;
  return (
    <div className="picker-wrap" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-top">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / symbol / contract…"
          />
          <button onClick={onClose}>Close</button>
        </div>

        {qIsAddr && (
          <div className="custom-load">
            <div className="custom-left">
              <div className="custom-caption">
                Contract on {CHAINS.find((c) => c.id === chainId)?.name}:
              </div>
              <code className="custom-code">{q.trim()}</code>
            </div>
            <div className="custom-right">
              <button
                disabled={loadingCustom}
                onClick={async () => {
                  setLoadingCustom(true);
                  setCustomErr(null);
                  try {
                    await onLoadByAddress(q.trim());
                    setQ("");
                  } catch (e: any) {
                    setCustomErr(e?.message || "Failed to load token");
                  } finally {
                    setLoadingCustom(false);
                  }
                }}
              >
                {loadingCustom ? "Loading…" : "Add token from chain"}
              </button>
              {customErr && <div className="err">{customErr}</div>}
            </div>
          </div>
        )}

        <div className="picker-list">
          {tokens ? (
            list.length ? (
              list.map((t) => (
                <button
                  key={t.address + t.symbol}
                  className="picker-row"
                  onClick={() => (onSelect(t), onClose())}
                >
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
        .picker-wrap { position: fixed; inset: 0; background: rgba(0,0,0,.4); display:flex; align-items:flex-start; justify-content:center; padding:10vh 12px 24px; z-index:50; }
        .picker { width:600px; max-width:92vw; background:#fff; border:1px solid #e6e8eb; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.12); overflow:hidden; }

        .picker-top { display:flex; gap:8px; padding:12px; border-bottom:1px solid #eef0f2; }
        .picker-top input { flex:1; border:1px solid #e6e8eb; border-radius:10px; padding:10px 12px; }

        .custom-load { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border-bottom:1px solid #f3f5f7; flex-wrap:wrap; }
        .custom-left { display:flex; align-items:center; gap:10px; flex:1 1 320px; min-width:0; }
        .custom-caption { white-space:nowrap; color:#374151; }
        .custom-code { background:#f6f8fa; border:1px solid #e6e8eb; padding:4px 6px; border-radius:6px; max-width:100%; overflow:auto; word-break:break-all; }
        .custom-right { display:flex; align-items:center; gap:8px; }
        .custom-load button { border:1px solid #0f9d58; border-radius:10px; padding:6px 10px; background:#0f9d58; color:#fff; }

        .picker-list { max-height:60vh; overflow:auto; }
        .picker-row { width:100%; display:grid; grid-template-columns:32px 1fr auto; gap:10px; align-items:center; padding:10px 12px; border-bottom:1px solid #f3f5f7; text-align:left; }
        .picker-row:hover { background:#f9f9fb; }
        .logo img { width:28px; height:28px; border-radius:50%; }
        .dot { width:10px; height:10px; background:#c4c9cf; border-radius:50%; display:inline-block; }
        .pick-symbol { font-weight:600; }
        .pick-name { font-size:12px; color:#6b7280; }
        .pick-addr { font-size:11px; color:#9aa1a9; }
        .picker-empty { padding:16px; color:#6b7280; font-size:14px; }
        .err { color:#b42318; font-size:12px; }
      `}</style>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Page() {
  // wallet
  const [account, setAccount] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [chainId, setChainId] = useState<number>(56); // default BNB

  // tokens
  const [tokens, setTokens] = useState<TokensByAddr | undefined>(undefined);
  const [srcToken, setSrcToken] = useState<Token | undefined>(undefined);
  const [dstToken, setDstToken] = useState<Token | undefined>(undefined);
  const [pickSrcOpen, setPickSrcOpen] = useState(false);
  const [pickDstOpen, setPickDstOpen] = useState(false);

  // which side the user is editing: "src" (top) or "dst" (bottom)
  const [editSide, setEditSide] = useState<"src" | "dst">("src");

  // amounts as text
  const [amountIn, setAmountIn] = useState<string>("1");      // user edits when editSide==='src'
  const [amountOut, setAmountOut] = useState<string>("");     // user edits when editSide==='dst'
  const [computedInFromOut, setComputedInFromOut] = useState<string>("0"); // shown in top when editing bottom

  // slippage
  const [slipMode, setSlipMode] = useState<"slow" | "market" | "fast" | "custom">("market");
  const [customSlip, setCustomSlip] = useState<string>("");

  // quote + USD
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [payUsd, setPayUsd] = useState<number | null>(null);
  const [recvUsd, setRecvUsd] = useState<number | null>(null);

  // balances
  const [srcBal, setSrcBal] = useState<number | null>(null);
  const [dstBal, setDstBal] = useState<number | null>(null);

  // NEW: price impact state (% as a number, e.g. 0.27 means 0.27%)
  const [priceImpactPct, setPriceImpactPct] = useState<number | null>(null);

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
  function disconnect() {
    setAccount(null);
  }

  // switch chain in wallet when UI chain changes
  useEffect(() => {
    (async () => {
      try {
        if (walletChainId == null || walletChainId === chainId) return;
        await ensureChain(chainId);
      } catch (e: any) {
        console.warn("chain switch/add failed:", e?.message || e);
      }
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
    const fuzzy = vals.find((t) =>
      /eth|weth|bnb|wbnb|matic|wmatic|avax|wavax|ftm|wftm|xdai|wxdai|gno|wgno/i.test(
        (t.symbol || "") + " " + (t.name || "")
      )
    );
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
    return () => {
      stop = true;
    };
  }, [chainId]);

  function onPickSrc(t: Token) {
    if (isNativeSymbol(chainId, t.symbol) || t.address.toLowerCase() === NATIVE.toLowerCase()) {
      const nat = asNativeToken(chainId, t);
      if (nat) setSrcToken(nat);
      else setSrcToken(t);
    } else setSrcToken(t);
  }
  function onPickDst(t: Token) {
    setDstToken(t);
  }

  /* ---- Add custom by address ---- */
  async function loadCustomAddress(addr: string) {
    const a = addr.trim().toLowerCase();
    if (!isAddress(a)) throw new Error("Not a contract address (must start 0x + 40 chars)");
    const meta = await readErc20MetaViaRpc(chainId, a);
    if (!meta) throw new Error("Could not read token (check network/contract)");
    setTokens((prev) => {
      const next = { ...(prev || {}) };
      next[a] = {
        ...meta,
        logoURI: meta.logoURI || `https://tokens.1inch.io/${chainId}/${a}.png`,
      };
      return next;
    });
    setSrcToken((s) => s || (meta as Token));
  }

  /* =========== QUOTES (two directions) =========== */
  useEffect(() => {
    if (!srcToken || !dstToken) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      setQuoting(true);
      setQuoteErr(null);
      setPriceImpactPct(null); // reset while we recompute
      try {
        if (editSide === "src") {
          // normal: src -> dst for amountIn
          const body = {
            chainId,
            src: srcToken.address,
            dst: dstToken.address,
            amount: toUnits(amountIn || "0", srcToken.decimals),
          };
          const r = await fetch("/api/oneinch/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = (await r.json()) as QuoteResponse;
          setQuote(j);
          if (!("ok" in j) || !j.ok) {
            setQuoteErr((j as any).error || "quote failed");
          } else {
            // --- NEW: compute price impact vs tiny trade (approx. no-slippage unit price)
            await computePriceImpactPct({
              chainId,
              srcToken,
              dstToken,
              amountInTokens: Number(amountIn || "0"),
              mainQuote: j as QuoteOk,
              setPct: setPriceImpactPct,
            });
          }
        } else {
          // reverse: user typed desired OUT; estimate needed IN by quoting dst -> src
          const body = {
            chainId,
            src: dstToken.address,
            dst: srcToken.address,
            amount: toUnits(amountOut || "0", dstToken.decimals),
          };
          const r = await fetch("/api/oneinch/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = (await r.json()) as QuoteResponse;
          if ("ok" in j && j.ok) {
            const needIn = Number(j.data.dstAmount) / 10 ** (srcToken.decimals || 18);
            setComputedInFromOut(needIn ? String(needIn) : "0");
            // also set a forward-looking quote so the bottom shows a clean number too
            const forward = await fetch("/api/oneinch/quote", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chainId,
                src: srcToken.address,
                dst: dstToken.address,
                amount: toUnits(String(needIn || 0), srcToken.decimals),
              }),
            });
            const fwd = (await forward.json()) as QuoteResponse;
            setQuote(fwd);
            if ("ok" in fwd && fwd.ok) {
              await computePriceImpactPct({
                chainId,
                srcToken,
                dstToken,
                amountInTokens: needIn || 0,
                mainQuote: fwd as QuoteOk,
                setPct: setPriceImpactPct,
              });
            } else {
              setPriceImpactPct(null);
            }
          } else {
            setComputedInFromOut("0");
            setQuote(j);
            setQuoteErr((j as any).error || "quote failed");
            setPriceImpactPct(null);
          }
        }
      } catch (e: any) {
        setQuote(null);
        setQuoteErr(e?.message || String(e));
        setPriceImpactPct(null);
      } finally {
        setQuoting(false);
      }
    }, 250);
  }, [editSide, chainId, srcToken?.address, dstToken?.address, amountIn, amountOut, srcToken?.decimals, dstToken?.decimals]);

  /* ---- Simple USD reflections ---- */
  useEffect(() => {
    (async () => {
      try {
        if (!srcToken || !dstToken) return setPayUsd(null);

        // what the user is "paying" depends on which side they edit
        if (editSide === "src") {
          if ((srcToken.symbol || "").toUpperCase() === "USDC") return setPayUsd(Number(amountIn || "0"));
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
          const j = (await r.json()) as QuoteResponse;
          if ((j as QuoteOk).ok) {
            const out = Number((j as QuoteOk).data.dstAmount) / 10 ** (dstToken.decimals || 6);
            setPayUsd(out);
          } else setPayUsd(null);
        } else {
          // editing desired OUT — treat payUsd as desired USDC (if USDC) otherwise just echo amountOut
          setPayUsd(Number(amountOut || "0"));
        }
      } catch {
        setPayUsd(null);
      }
    })();

    (async () => {
      try {
        if (!dstToken || !quote || !("ok" in quote) || !quote.ok) return setRecvUsd(null);
        const out = Number(quote.data.dstAmount) / 10 ** (dstToken.decimals || 6);
        setRecvUsd(out || null);
      } catch {
        setRecvUsd(null);
      }
    })();
  }, [editSide, chainId, srcToken, dstToken, amountIn, amountOut, quote]);

  /* ---- Balances (direct RPC via wallet) ---- */
  useEffect(() => {
    (async () => {
      try {
        if (!account || !srcToken) return setSrcBal(null);
        try { await ensureChain(chainId); } catch {}
        const bal = await readTokenBalance(account, srcToken);
        setSrcBal(bal);
      } catch { setSrcBal(null); }
    })();
  }, [account, chainId, srcToken?.address]);

  useEffect(() => {
    (async () => {
      try {
        if (!account || !dstToken) return setDstBal(null);
        try { await ensureChain(chainId); } catch {}
        const bal = await readTokenBalance(account, dstToken);
        setDstBal(bal);
      } catch { setDstBal(null); }
    })();
  }, [account, chainId, dstToken?.address]);

  /* ---- Build + Send ---- */
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
      const srcAmt = editSide === "src" ? amountIn : computedInFromOut;
      const body = {
        chainId,
        from: account,
        src: srcToken.address,
        dst: dstToken.address,
        amount: toUnits(srcAmt || "0", srcToken.decimals),
        slippageBps: bps,
      };

      const r = await fetch("/api/oneinch/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as SwapBuildResponse;
      if (!j.ok || !j.data?.tx) return alert((j as any)?.error || "Swap build failed");

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

      const txHash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });
      alert("Transaction submitted: " + txHash);
    } catch (e: any) {
      alert(e?.message || JSON.stringify(e));
    }
  }

  const toAmount = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok) return "0.000000";
    const out = Number(quote.data.dstAmount) / 10 ** (quote.data.dstToken.decimals || 6);
    return out.toFixed(6);
  }, [quote]);

  const rateText = useMemo(() => {
    if (!quote || !("ok" in quote) || !quote.ok || !srcToken || !dstToken) return "—";
    const aIn = Number((editSide === "src" ? amountIn : computedInFromOut) || "0");
    const out = Number(quote.data.dstAmount) / 10 ** dstToken.decimals;
    return aIn ? `${fmt(out / aIn, 6)} ${dstToken.symbol} per ${srcToken.symbol}` : "—";
  }, [quote, amountIn, computedInFromOut, editSide, srcToken, dstToken]);

  // --- NEW: human text for price impact
  const priceImpactText = useMemo(() => {
    if (priceImpactPct == null || !Number.isFinite(priceImpactPct)) return "—";
    return `${priceImpactPct.toFixed(2)}%`;
  }, [priceImpactPct]);

  // MAX: uses src balance; for native leaves tiny gas buffer
  const onMaxSrc = () => {
    if (srcBal == null || !srcToken) return;
    let max = srcBal;
    const isNative = srcToken.address.toLowerCase() === NATIVE.toLowerCase();
    if (isNative) max = Math.max(0, max - 0.0003); // leave dust for gas
    setEditSide("src");
    setAmountIn(max > 0 ? String(Number(max.toFixed(6))) : "0");
  };
  const onMaxDst = () => {
    // keep behavior simple: swap all you can pay (same as top MAX)
    onMaxSrc();
  };

  const onFlip = () => {
    const a = srcToken;
    const b = dstToken;
    setSrcToken(b);
    setDstToken(a);
  };

  // values for the two inputs
  const payInputValue = editSide === "src" ? amountIn : (computedInFromOut ? String(Number(computedInFromOut)) : "");
  const recvInputValue = editSide === "src" ? toAmount : amountOut;

  return (
    <div className="wrap">
      <div className="card">
        <div className="head">
          <div className="title">PCW Swap</div>
          <div className="right">
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
            <input
              className="amt"
              value={payInputValue}
              inputMode="decimal"
              onFocus={() => setEditSide("src")}
              onChange={(e) => setAmountIn(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.0"
            />
            <button className="max" onClick={onMaxSrc}>MAX</button>
          </div>
        </div>
        <div className="metaRow">
          <div className="usd">{payUsd != null ? `$${fmt(payUsd, 2)}` : "—"}</div>
          <div className="bal">Balance: {srcBal != null ? fmt(srcBal, 6) : "—"}</div>
        </div>

        {/* centered flip */}
        <div className="flip-wrap">
          <button className="flip" onClick={onFlip} aria-label="Flip pay/receive">↑↓</button>
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
            <input
              className="amt"
              value={recvInputValue}
              inputMode="decimal"
              onFocus={() => setEditSide("dst")}
              onChange={(e) => setAmountOut(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.0"
            />
            <button className="max" onClick={onMaxDst}>MAX</button>
          </div>
        </div>
        <div className="metaRow">
          <div className="usd">{recvUsd != null ? `$${fmt(recvUsd, 2)}` : "—"}</div>
          <div className="bal">Balance: {dstBal != null ? fmt(dstBal, 6) : "—"}</div>
        </div>

        {/* Slippage */}
        <div className="slip">
          <span className="muted">Slippage</span>
          <div className="chips">
            <button className={`chip ${slipMode === "slow" ? "on" : ""}`} onClick={() => setSlipMode("slow")}>
              Slow
            </button>
            <button className={`chip ${slipMode === "market" ? "on" : ""}`} onClick={() => setSlipMode("market")}>
              Market
            </button>
            <button className={`chip ${slipMode === "fast" ? "on" : ""}`} onClick={() => setSlipMode("fast")}>
              Fast
            </button>
            <div className="custom">
              <button className={`chip ${slipMode === "custom" ? "on" : ""}`} onClick={() => setSlipMode("custom")}>
                custom %
              </button>
              <input
                value={customSlip}
                placeholder={(bps / 100).toString()}
                onChange={(e) => setCustomSlip(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="meta">
          <div className="muted">{rateText}</div>
          <div className="muted">Est. network fee: – <span className="impact">• Price impact: {priceImpactText}</span></div>
        </div>

        {quoteErr && <div className="err">Quote error: {quoteErr}</div>}

        <button className="swap" onClick={onSwap} disabled={!srcToken || !dstToken || quoting}>
          Swap
        </button>
      </div>

      {/* Pickers */}
      <TokenPicker
        open={pickSrcOpen}
        onClose={() => setPickSrcOpen(false)}
        tokens={tokens}
        onSelect={onPickSrc}
        onLoadByAddress={loadCustomAddress}
        chainId={chainId}
      />
      <TokenPicker
        open={pickDstOpen}
        onClose={() => setPickDstOpen(false)}
        tokens={tokens}
        onSelect={onPickDst}
        onLoadByAddress={loadCustomAddress}
        chainId={chainId}
      />

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
        .amtBox { display:flex; align-items:center; gap:8px; justify-content:flex-end; }
        .amt { text-align:right; font-size:18px; border:none; outline:none; background:transparent; }
        .max { border:1px solid #d7dbdf; border-radius:999px; padding:4px 8px; font-size:12px; background:#f6f8fa; }
        .metaRow { display:flex; justify-content:space-between; margin-top:4px; }
        .usd { font-size:12px; color:#6b7280; }
        .bal { font-size:12px; color:#6b7280; }
        .flip-wrap { display:flex; justify-content:center; align-items:center; margin: 8px 0 10px; }
        .flip { width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; border:1px solid #e6e8eb; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,.06); cursor:pointer; font-weight:700; line-height:1; }
        .flip:hover { background:#f7f9fb; }
        .slip { display:flex; justify-content:space-between; align-items:center; margin-top:14px; }
        .chips { display:flex; gap:8px; align-items:center; }
        .chip { border:1px solid #d7dbdf; background:#f6f8fa; border-radius:999px; padding:6px 10px; font-size:12px; }
        .chip.on { background:#0f9d58; color:#fff; border-color:#0f9d58; }
        .custom { display:flex; align-items:center; gap:6px; }
        .custom input { width:60px; border:1px solid #e6e8eb; border-radius:8px; padding:6px 8px; text-align:right; font-size:12px; }
        .meta { display:flex; justify-content:space-between; font-size:12px; margin-top:8px; }
        .muted { color:#6b7280; }
        .impact { color:#b42318; font-weight:600; }
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

/* ---- minimal balance readers via wallet RPC ---- */
async function readTokenBalance(account: string, token: Token): Promise<number> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");

  // Native coin
  if (token.address.toLowerCase() === NATIVE.toLowerCase()) {
    const hexBal: string = await eth.request({ method: "eth_getBalance", params: [account, "latest"] });
    const wei = BigInt(hexBal);
    return Number(wei) / 10 ** (token.decimals || 18);
  }

  // ERC-20 balanceOf(address)
  const selector = "0x70a08231";
  const addr = account.replace(/^0x/, "").padStart(64, "0");
  const data = selector + addr;
  const hex: string = await eth.request({
    method: "eth_call",
    params: [{ to: token.address, data }, "latest"],
  });
  const raw = BigInt(hex || "0x0");
  return Number(raw) / 10 ** (token.decimals || 18);
}

/* ================== NEW: price impact helper ================== */
async function computePriceImpactPct(opts: {
  chainId: number;
  srcToken: Token;
  dstToken: Token;
  amountInTokens: number;         // amount user is actually trading (in tokens, not units)
  mainQuote: QuoteOk;             // the real quote for the trade size
  setPct: (n: number | null) => void;
}) {
  const { chainId, srcToken, dstToken, amountInTokens, mainQuote, setPct } = opts;

  try {
    // If trade size is 0 or invalid, nothing to compute.
    if (!amountInTokens || !Number.isFinite(amountInTokens) || amountInTokens <= 0) {
      setPct(null);
      return;
    }

    // Choose a very small "epsilon" trade to approximate the mid-price (near-zero slippage).
    // We cap between 1e-6 token and 0.01 token so it's not too tiny/huge across tokens.
    const epsTokenAmount = Math.max(Math.min(amountInTokens, 0.01), 0.000001);

    const epsBody = {
      chainId,
      src: srcToken.address,
      dst: dstToken.address,
      amount: toUnits(String(epsTokenAmount), srcToken.decimals),
    };

    const r = await fetch("/api/oneinch/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(epsBody),
    });
    const epsQ = (await r.json()) as QuoteResponse;

    if (!("ok" in epsQ) || !epsQ.ok) {
      // If baseline fails, we simply show "—" instead of a wrong number.
      setPct(null);
      return;
    }

    // Convert both quotes into token-space (not units).
    const epsOut = Number(epsQ.data.dstAmount) / 10 ** (dstToken.decimals || 18);
    const epsIn = epsTokenAmount;

    const unitPriceBaseline = epsIn > 0 ? epsOut / epsIn : 0; // dst per 1 src with ~no slippage

    const actualOut = Number(mainQuote.data.dstAmount) / 10 ** (dstToken.decimals || 18);
    const idealOut = unitPriceBaseline * amountInTokens;

    // Price impact is how much worse the actual is vs the ideal, as a %
    // Clamp to [0, 100] and guard math edge cases.
    let impact = 0;
    if (idealOut > 0) {
      impact = ((idealOut - actualOut) / idealOut) * 100;
    }
    if (!Number.isFinite(impact) || impact < 0) impact = 0;
    if (impact > 100) impact = 100;

    setPct(impact);
  } catch {
    setPct(null);
  }
}
