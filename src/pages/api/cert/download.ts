// src/pages/api/cert/download.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { verifyCertToken } from "@/lib/verifyCertToken";
import { buildCertMessage } from "@/lib/certMessage";
import { renderCertificatePng } from "@/lib/certRender";
import { isLocked, tryConsumeOnce } from "@/lib/certLock";

const ERC721_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

function pickPolygonRpc() {
  const single = process.env.POLYGON_RPC_URL;
  if (single) return single;

  const list = (process.env.POLYGON_RPC_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list[0] || "https://polygon-rpc.com";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { token, wallet, signature } = req.body ?? {};
    const tokenStr = String(token || "");
    const walletStr = String(wallet || "");
    const sigStr = String(signature || "");

    if (!tokenStr || !walletStr || !sigStr) return res.status(400).json({ ok: false, error: "Missing token/wallet/signature" });
    if (!ethers.isAddress(walletStr)) return res.status(400).json({ ok: false, error: "Invalid wallet" });

    const secret = process.env.CERT_TOKEN_SECRET || "";
    if (!secret) return res.status(500).json({ ok: false, error: "Missing CERT_TOKEN_SECRET" });

    const payload = verifyCertToken(tokenStr, secret);

    const expected = String(process.env.CERT_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CERT_CONTRACT_ADDRESS || "").toLowerCase();
    if (!expected) return res.status(500).json({ ok: false, error: "Missing CERT_CONTRACT_ADDRESS" });

    if (String(payload.contract || "").toLowerCase() !== expected) {
      return res.status(400).json({ ok: false, error: "CERT TOKEN CONTRACT MISMATCH" });
    }

    // SECOND SIGNATURE: action=download
    const msg = buildCertMessage({
      action: "download",
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

    // ownerOf check (again)
    const provider = new ethers.JsonRpcProvider(pickPolygonRpc());
    const nft = new ethers.Contract(expected, ERC721_ABI, provider);
    const owner: string = await nft.ownerOf(payload.tokenId);

    if (owner.toLowerCase() !== walletStr.toLowerCase()) {
      return res.status(401).json({ ok: false, error: "Wallet is not token owner" });
    }

    // Optional single-use lock
    const lockKey = `cert:${payload.chainId}:${expected}:${payload.tokenId}`;
    if (await isLocked(lockKey)) {
      return res.status(410).json({ ok: false, error: "Certificate already downloaded (locked)" });
    }
    const consumed = await tryConsumeOnce(lockKey, { wallet: walletStr.toLowerCase() });
    if (!consumed) {
      return res.status(410).json({ ok: false, error: "Certificate already downloaded (locked)" });
    }

    // Render final watermarked PNG
    const buf = await renderCertificatePng({
      tokenId: Number(payload.tokenId),
      nftContract: expected,
      owner: walletStr,
      verified: true,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="WFACTORY_CERT_${payload.tokenId}.png"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Download failed" });
  }
}
