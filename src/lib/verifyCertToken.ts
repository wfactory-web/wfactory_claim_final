// src/lib/verifyCertToken.ts
import crypto from "crypto";

export type CertTokenPayload = {
  v?: 1;
  chainId: number;
  contract: string; // MUST be NFT contract
  tokenId: number;
  nonce: string;
  exp: number;
};

type CertTokenHeader = {
  alg: "HS256";
  typ: "JWT";
  v?: 1;
};

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(str: string) {
  const pad = 4 - (str.length % 4 || 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(base64, "base64");
}

/**
 * SERVER: Create a signed token (header.payload.sig).
 * This matches verifyCertToken() below.
 */
export function makeCertToken(payload: CertTokenPayload, secret: string) {
  const header: CertTokenHeader = { alg: "HS256", typ: "JWT", v: 1 };

  const h = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = b64urlEncode(Buffer.from(JSON.stringify({ ...payload, v: payload.v ?? 1 })));
  const data = `${h}.${p}`;

  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  const s = b64urlEncode(sig);

  return `${h}.${p}.${s}`;
}

/**
 * CLIENT/DEBUG: decode only, no signature verification.
 */
export function decodeCertTokenUnsafe(token: string): CertTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  return JSON.parse(b64urlDecode(parts[1]).toString("utf-8"));
}

/**
 * SERVER: verify signature + payload sanity + exp.
 */
export function verifyCertToken(token: string, secret: string): CertTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [h, p, s] = parts;
  const data = `${h}.${p}`;

  const expected = crypto.createHmac("sha256", secret).update(data).digest();
  const expectedS = b64urlEncode(expected);

  const a = Buffer.from(expectedS);
  const b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload: CertTokenPayload = JSON.parse(b64urlDecode(p).toString("utf-8"));

  const v = (payload as any).v ?? 1;
  (payload as any).v = v;
  if (v !== 1) throw new Error("Unsupported token version");

  if (!payload.contract) throw new Error("Missing contract");
  if (!Number.isFinite(payload.tokenId)) throw new Error("Missing tokenId");
  if (!payload.nonce) throw new Error("Missing nonce");
  if (!Number.isFinite(payload.exp)) throw new Error("Missing exp");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token expired");

  return payload;
}
