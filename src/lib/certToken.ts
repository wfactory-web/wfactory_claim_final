// lib/certToken.ts
import jwt from "jsonwebtoken";

export type CertTokenPayload = {
  tokenId: number;
  chainId: number;
  contract: string; // NFT contract
  nonce: string;
  iat: number;
  exp: number;
};

function secret(): string {
  const s = process.env.CERT_TOKEN_SECRET;
  if (!s) throw new Error("Missing CERT_TOKEN_SECRET");
  return s;
}

export function verifyCertToken(token: string): CertTokenPayload {
  const payload = jwt.verify(token, secret()) as any;

  // hard validate
  if (
    typeof payload !== "object" ||
    typeof payload.tokenId !== "number" ||
    typeof payload.chainId !== "number" ||
    typeof payload.contract !== "string" ||
    typeof payload.nonce !== "string"
  ) {
    throw new Error("Invalid certificate token payload");
  }

  return payload as CertTokenPayload;
}
