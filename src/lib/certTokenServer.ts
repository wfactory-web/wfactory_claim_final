import jwt from "jsonwebtoken";

export type CertTokenPayload = {
  tokenId: number;
  chainId: number;
  contract: `0x${string}`;
  nonce: string;
  iat: number;
  exp: number;
};

function requireCertSecret() {
  const s = process.env.CERT_TOKEN_SECRET;
  if (!s) throw new Error("Missing CERT_TOKEN_SECRET in .env.local");
  return s;
}

export function verifyCertToken(token: string): CertTokenPayload {
  const secret = requireCertSecret();
  const payload = jwt.verify(token, secret) as any;

  const tokenId = Number(payload.tokenId);
  const chainId = Number(payload.chainId);
  const contract = String(payload.contract || "");
  const nonce = String(payload.nonce || "");
  const iat = Number(payload.iat || 0);
  const exp = Number(payload.exp || 0);

  if (!Number.isFinite(tokenId)) throw new Error("Invalid tokenId");
  if (!Number.isFinite(chainId)) throw new Error("Invalid chainId");
  if (!contract.startsWith("0x") || contract.length !== 42) throw new Error("Invalid contract");
  if (!nonce) throw new Error("Missing nonce");
  if (!Number.isFinite(exp) || exp <= 0) throw new Error("Invalid exp");

  return {
    tokenId,
    chainId,
    contract: contract as `0x${string}`,
    nonce,
    iat,
    exp,
  };
}

export function createCertToken(p: {
  tokenId: number;
  chainId: number;
  contract: `0x${string}`;
  ttlSec?: number; // optional, default 30 min
}): string {
  const secret = requireCertSecret();

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.floor(p.ttlSec ?? 60 * 30)); // min 60s, default 30m

  const payload: Omit<CertTokenPayload, "iat" | "exp"> & { iat: number; exp: number } = {
    tokenId: p.tokenId,
    chainId: p.chainId,
    contract: p.contract,
    nonce: cryptoRandomNonce(),
    iat: now,
    exp: now + ttl,
  };

  return jwt.sign(payload, secret);
}

function cryptoRandomNonce() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("crypto");
    return crypto.randomBytes(16).toString("hex");
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
