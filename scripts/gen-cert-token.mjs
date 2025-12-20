import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${b64url(sig)}`;
}

const secret = process.env.CERT_TOKEN_SECRET;
if (!secret) throw new Error("Missing CERT_TOKEN_SECRET");

const tokenId = Number(process.argv[2]);
const days = Number(process.argv[3] ?? 365);

const payload = {
  tokenId,
  exp: Math.floor(Date.now() / 1000) + days * 86400,
  nonce: crypto.randomUUID(),
};

const token = sign(payload, secret);

console.log(`http://localhost:3000/cert/${token}`);
