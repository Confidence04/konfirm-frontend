// Single source of truth for building stellar.expert explorer links.
//
// Both the Blockchain and Treasury admin pages used to hardcode the
// "testnet" segment of this URL, which meant every explorer link would
// silently point at the wrong network's explorer once the backend is
// pointed at mainnet. Callers should pass the network reported by the
// backend (e.g. `BlockchainStatus.network`) wherever it's available.
const DEFAULT_NETWORK = "testnet";

export function explorerUrl(id: string, network?: string | null): string {
  const net = network || DEFAULT_NETWORK;
  return `https://stellar.expert/explorer/${net}/contract/${id}`;
}

export function explorerTxUrl(hash: string, network?: string | null): string {
  const net = network || DEFAULT_NETWORK;
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}
