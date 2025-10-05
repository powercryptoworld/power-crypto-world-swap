export const CHAINS = [
  { id: 1, name: "Ethereum" },
  { id: 56, name: "BSC" },
] as const;

export function rpcUrl(id: number) {
  const v = process.env[`NEXT_PUBLIC_RPC_${id}` as any];
  if (!v) throw new Error(`Missing RPC for chain ${id}`);
  return v as string;
}
