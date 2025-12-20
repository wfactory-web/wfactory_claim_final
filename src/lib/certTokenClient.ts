// src/lib/certTokenClient.ts
export type CertTokenPayloadUnsafe = {
  tokenId?: number;
  chainId?: number;
  contract?: string;
  nonce?: string;
  exp?: number;
  v?: number;
};

function b64urlToJson(seg: string) {
  const s = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const json = Buffer.from(s + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

/**
 * Client-side ONLY: does not verify signature.
 */
export function decodeCertTokenUnsafe(token: string): CertTokenPayloadUnsafe {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    return b64urlToJson(parts[1]) as CertTokenPayloadUnsafe;
  } catch {
    return {};
  }
}
