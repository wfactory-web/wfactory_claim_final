// scripts/make-cert-token.mjs
// Usage:
//   node scripts/make-cert-token.mjs 18
// Output:
//   token + URL: http://localhost:3000/cert/<token>

import "dotenv/config";
import crypto from "crypto";

// ---- helpers ----
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hmacSHA256(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// ---- read args/env ----
const tokenIdArg = process.argv[2];
if (!tokenIdArg || !/^\d+$/.test(tokenIdArg)) {
  console.error("❌ Missing tokenId. Example: node scripts/make-cert-token.mjs 18");
  process.exit(1);
}
const tokenId = Number(tokenIdArg);

const secret =
  process.env.CERT_TOKEN_SECRET ||
  process.env.NEXT_PUBLIC_CERT_TOKEN_SECRET ||
  "";

if (!secret || secret.length < 16) {
  console.error(
    "❌ Missing/weak CERT_TOKEN_SECRET in .env.local (use a long random string)"
  );
  process.exit(1);
}

// IMPORTANT: use the SAME NFT contract as your claim system
const contract =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_CERT_CONTRACT_ADDRESS ||
  "";

if (!contract || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
  console.error(
    "❌ Missing NEXT_PUBLIC_CONTRACT_ADDRESS (recommended) or NEXT_PUBLIC_CERT_CONTRACT_ADDRESS"
  );
  process.exit(1);
}

// ---- payload (v1) ----
// Put BOTH version keys to avoid “Unsupported token version” across old/new verifiers.
const exp = nowSec() + 60 * 60 * 24 * 365; // 365 days (change if you want)
const nonce = b64url(crypto.randomBytes(16));

const payload = {
  v: 1,
  version: 1,
  contract,
  tokenId,
  nonce,
  exp,
};

const payloadJson = JSON.stringify(payload);
const payloadB64 = b64url(payloadJson);

// token format: v1.<payloadB64>.<sigB64>
const sig = hmacSHA256(`v1.${payloadB64}`, secret);
const sigB64 = b64url(sig);

const token = `v1.${payloadB64}.${sigB64}`;

// ---- output ----
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
console.log("✅ CERT TOKEN (v1):");
console.log(token);
console.log("\n✅ CERT URL:");
console.log(`${baseUrl}/cert/${encodeURIComponent(token)}`);
console.log("\nPayload:", payload);
