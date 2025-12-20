// src/lib/certMessage.ts
export type CertAction = "verify" | "download";

export function buildCertMessage(p: {
  action: CertAction;
  chainId: number;
  contract: string;
  tokenId: number;
  wallet: string;
  nonce: string;
  exp: number;
}) {
  // ⚠️ ORDER MATTERS — DO NOT CHANGE
  return [
    "W FACTORY CERTIFICATE",
    `action:${p.action}`,
    `chainId:${p.chainId}`,
    `contract:${p.contract.toLowerCase()}`,
    `tokenId:${p.tokenId}`,
    `wallet:${p.wallet.toLowerCase()}`,
    `nonce:${p.nonce}`,
    `exp:${p.exp}`,
  ].join("\n");
}
