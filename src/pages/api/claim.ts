// src/pages/api/claim.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { createCertToken } from "@/lib/certTokenServer";

type Ok = { ok: true; txHash: string; tokenId: string; certToken: string };
type Fail = { ok: false; error: string };

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizePk(name: string, vRaw: string) {
  const v = vRaw.trim().startsWith("0x") ? vRaw.trim() : `0x${vRaw.trim()}`;
  if (v.length !== 66) throw new Error(`${name} invalid length (need 66 incl 0x). Got ${v.length}`);
  return v;
}

function normalize0xHex(name: string, vRaw: string) {
  const v = vRaw.trim().startsWith("0x") ? vRaw.trim() : `0x${vRaw.trim()}`;
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error(`${name} must be hex string`);
  return v;
}

function isHexBytes32(x: any) {
  return typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x);
}

const ABI = [
  "function mintSigned((address to,uint256 tokenId,string uri,bytes32 nfcHash,uint256 validUntil) req, bytes sig)",
];

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Fail>) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body ?? {};
    const { contractAddress: contractAddressFromBody, mintReq, sig: sigRaw } = body;

    // ✅ Recommended: lock contract address to env (prevents someone abusing your relayer)
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || contractAddressFromBody;

    if (!contractAddress || typeof contractAddress !== "string" || !ethers.isAddress(contractAddress)) {
      return res.status(400).json({ ok: false, error: "Invalid/missing contractAddress" });
    }
    if (!mintReq || typeof mintReq !== "object") {
      return res.status(400).json({ ok: false, error: "Missing mintReq" });
    }
    if (!sigRaw || typeof sigRaw !== "string" || sigRaw.length < 10) {
      return res.status(400).json({ ok: false, error: "Missing sig" });
    }

    const sig = normalize0xHex("sig", sigRaw); // ensure 0x prefix

    if (!ethers.isAddress(String(mintReq.to))) {
      return res.status(400).json({ ok: false, error: "mintReq.to invalid address" });
    }
    if (!isHexBytes32(mintReq.nfcHash)) {
      return res.status(400).json({ ok: false, error: "mintReq.nfcHash must be bytes32 (0x + 64 hex)" });
    }
    if (!mintReq.uri || typeof mintReq.uri !== "string") {
      return res.status(400).json({ ok: false, error: "mintReq.uri missing" });
    }
    if (mintReq.tokenId === undefined || mintReq.tokenId === null || String(mintReq.tokenId) === "") {
      return res.status(400).json({ ok: false, error: "mintReq.tokenId missing" });
    }
    if (mintReq.validUntil === undefined || mintReq.validUntil === null || String(mintReq.validUntil) === "") {
      return res.status(400).json({ ok: false, error: "mintReq.validUntil missing" });
    }

    const rpcUrl = mustEnv("POLYGON_RPC_URL");
    const relayerPk = normalizePk("RELAYER_PRIVATE_KEY", mustEnv("RELAYER_PRIVATE_KEY"));

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(relayerPk, provider);
    const contract = new ethers.Contract(contractAddress, ABI, wallet);

    const reqObj = {
      to: String(mintReq.to),
      tokenId: BigInt(String(mintReq.tokenId)),
      uri: String(mintReq.uri),
      nfcHash: String(mintReq.nfcHash),
      validUntil: BigInt(String(mintReq.validUntil)),
    };

    const tx = await contract.mintSigned(reqObj, sig);
    const receipt = await tx.wait();
    const certToken = createCertToken({
    tokenId: Number(BigInt(String(mintReq.tokenId))),
    chainId: 137,
    contract: contractAddress as `0x${string}`,
    ttlSec: 60 * 30,
  });

    return res.status(200).json({
    ok: true,
    txHash: receipt?.hash || tx.hash,
    tokenId: String(mintReq.tokenId),
    certToken,
  });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
