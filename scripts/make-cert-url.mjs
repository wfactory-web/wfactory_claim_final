import crypto from "crypto";
import jwt from "jsonwebtoken";

const [, , tokenId, chainId, nftContract] = process.argv;

if (!tokenId || !chainId || !nftContract) {
  console.error(
    "Usage: node scripts/make-cert-url.mjs <tokenId> <chainId> <nftContract>"
  );
  process.exit(1);
}

const SECRET = process.env.CERT_TOKEN_SECRET;
if (!SECRET) {
  console.error("❌ CERT_TOKEN_SECRET not set");
  process.exit(1);
}

// payload stored INSIDE cert token
const payload = {
  tokenId: Number(tokenId),
  chainId: Number(chainId),
  contract: nftContract.toLowerCase(),
  nonce: crypto.randomBytes(16).toString("hex"),
};

// 7 days expiry (you can change)
const token = jwt.sign(payload, SECRET, {
  expiresIn: "7d",
});

console.log("\n✅ CERTIFICATE URL:\n");
console.log(`http://localhost:3000/cert/${token}\n`);
