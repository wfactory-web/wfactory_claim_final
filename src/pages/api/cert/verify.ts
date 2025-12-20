// src/pages/api/cert/verify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

import { verifyCertToken } from "@/lib/verifyCertToken";
import { buildCertMessage } from "@/lib/certMessage";

type Ok = {
  ok: true;
  chainId: 137;
  tokenId: number;
  contract: string;
  owner: string;
  openseaUrl: string;
};

type Fail = { ok: false; error: string; detail?: any };

const ERC721_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

function pickPolygonRpc(): string {
  const single = (process.env.POLYGON_RPC_URL || "").trim();
  if (single) return single;

  const list = (process.env.POLYGON_RPC_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list[0] || "https://polygon-rpc.com";
}

function getExpectedNftContract(): string {
  const addr = String(
    process.env.CERT_CONTRACT_ADDRESS ||
      process.env.NEXT_PUBLIC_CERT_CONTRACT_ADDRESS ||
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
      ""
  ).trim();

  if (!addr) throw new Error("Missing CERT_CONTRACT_ADDRESS");
  if (!ethers.isAddress(addr)) throw new Error("Invalid CERT_CONTRACT_ADDRESS");

  return addr;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { token, wallet, signature } = (req.body ?? {}) as {
      token?: string;
      wallet?: string;
      signature?: string;
    };

    const tokenStr = String(token || "");
    const walletStr = String(wallet || "");
    const sigStr = String(signature || "");

    if (!tokenStr || !walletStr || !sigStr) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing token/wallet/signature" });
    }

    if (!ethers.isAddress(walletStr)) {
      return res.status(400).json({ ok: false, error: "Invalid wallet" });
    }

    const secret = String(process.env.CERT_TOKEN_SECRET || "");
    if (!secret) {
      return res.status(500).json({ ok: false, error: "Missing CERT_TOKEN_SECRET" });
    }

    // 1) Verify cert token HMAC + exp
    const payload = verifyCertToken(tokenStr, secret);

    // BS4 lock: must be Polygon
    if (Number(payload.chainId) !== 137) {
      return res.status(400).json({
        ok: false,
        error: "Wrong chain in token. Expected Polygon (137).",
        detail: { chainId: payload.chainId },
      });
    }

    const expected = getExpectedNftContract().toLowerCase();
    const tokenContract = String(payload.contract || "").toLowerCase();

    // BS4 lock: token must be bound to NFT contract
    if (tokenContract !== expected) {
      return res.status(400).json({
        ok: false,
        error:
          "CERT TOKEN CONTRACT MISMATCH. Token must contain NFT contract (0x6E7b...). Regenerate cert token.",
        detail: { tokenContract: payload.contract, expectedContract: expected },
      });
    }

    // 2) Verify wallet signature (canonical message)
    const msg = buildCertMessage({
      action: "verify",
      chainId: 137,
      contract: expected,
      tokenId: Number(payload.tokenId),
      wallet: walletStr,
      nonce: String(payload.nonce),
      exp: Number(payload.exp),
    });

    const recovered = ethers.verifyMessage(msg, sigStr);
    if (recovered.toLowerCase() !== walletStr.toLowerCase()) {
      return res.status(401).json({ ok: false, error: "Bad signature" });
    }

    // 3) On-chain ownerOf check
    const rpc = pickPolygonRpc();
    const provider = new ethers.JsonRpcProvider(rpc);
    const nft = new ethers.Contract(expected, ERC721_ABI, provider);

    let owner: string;
    try {
      owner = await nft.ownerOf(payload.tokenId);
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        error: "ownerOf() reverted. Token may not exist / not minted yet.",
        detail: {
          contract: expected,
          tokenId: payload.tokenId,
          rpc,
          reason: e?.reason,
          code: e?.code,
          message: e?.message,
        },
      });
    }

    if (owner.toLowerCase() !== walletStr.toLowerCase()) {
      return res.status(401).json({
        ok: false,
        error: "Wallet is not owner of this tokenId",
        detail: { ownerOnChain: owner, wallet: walletStr },
      });
    }

    const openseaUrl = `https://opensea.io/assets/matic/${expected}/${payload.tokenId}`;

    return res.status(200).json({
      ok: true,
      chainId: 137,
      tokenId: Number(payload.tokenId),
      contract: expected,
      owner,
      openseaUrl,
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Verify failed" });
  }
}
