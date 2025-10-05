"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WagmiProvider,
  createConfig,
  http,
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, bsc } from "viem/chains";

/** ---- Wagmi config (EVM: Ethereum + BSC) ---- */
const rpcEth = process.env.NEXT_PUBLIC_RPC_1 || "";
const rpcBsc = process.env.NEXT_PUBLIC_RPC_56 || "";

const config = createConfig({
  chains: [mainnet, bsc],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [mainnet.id]: http(rpcEth),
    [bsc.id]: http(rpcBsc),
  },
});

const queryClient = new QueryClient();

/** ---- Small helpers ---- */
function truncate(addr?: `0x${string}` | string, size = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

/** ---- Connect Wallet button + status ---- */
function ConnectBar() {
  const { address, isConnected, status } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.2 }}>
        <div>Status: <b>{status}</b>{isPending ? " (pending…)" : ""}</div>
        <div>
          {isConnected ? (
            <>
              Address: <b>{truncate(address)}</b> • Chain ID: <b>{chainId}</b>
            </>
          ) : (
            "Not connected"
          )}
        </div>
        {connectError && (
          <div style={{ marginTop: 4, color: "#b91c1c" }}>
            Error: {connectError.message}
          </div>
        )}
      </div>

      {isConnected ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => switchChain({ chainId: mainnet.id })}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
          >
            Switch to ETH
          </button>
          <button
            onClick={() => switchChain({ chainId: bsc.id })}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
          >
            Switch to BSC
          </button>
          <button
            onClick={() => disconnect()}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => connect({ connector: injectedConnector })}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
}

/** ---- Your main panel (put quote/swap UI below) ---- */
function Panel() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>PCW Swap</h1>
      <ConnectBar />

      {/* TODO: your quote/swap UI goes here. For now we just reserve space. */}
      <div
        style={{
          marginTop: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          background: "white",
        }}
      >
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Add your Quote / Swap components here.
        </div>
      </div>
    </div>
  );
}

/** ---- Wrap with React Query + Wagmi ---- */
export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <Panel />
      </WagmiProvider>
    </QueryClientProvider>
  );
}
