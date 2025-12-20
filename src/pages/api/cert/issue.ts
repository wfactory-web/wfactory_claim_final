// src/pages/api/cert/issue.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { makeCertToken } from "@/lib/verifyCertToken";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const pass = String(req.headers["x-dev-pass"] || "");
    const expectedPass = process.env.DEV_TOKEN_PASS || "";
    if (!expectedPass) return res.status(500).json({ ok: false, error: "Missing DEV_TOKEN_PASS" });
    if (pass !== expectedPass) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const tokenId = Number(req.body?.tokenId);
    if (!Number.isFinite(tokenId) || tokenId < 0) {
      return res.status(400).json({ ok: false, error: "Invalid tokenId" });
    }

    const secret = process.env.CERT_TOKEN_SECRET || "";
    if (!secret) return res.status(500).json({ ok: false, error: "Missing CERT_TOKEN_SECRET" });

    const nftContract = String(process.env.CERT_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CERT_CONTRACT_ADDRESS || "");
    if (!nftContract || !nftContract.startsWith("0x") || nftContract.length !== 42) {
      return res.status(500).json({ ok: false, error: "Missing/invalid CERT_CONTRACT_ADDRESS (NFT contract)" });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 30; // 30 days
    const nonce = crypto.randomBytes(16).toString("hex");

    const jwt = makeCertToken(
      {
        v: 1,
        chainId: 137,
        contract: nftContract, // ✅ IMPORTANT: NFT CONTRACT (0x6E7b...)
        tokenId,
        nonce,
        exp,
      },
      secret
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${baseUrl}/cert/${jwt}`;

    return res.status(200).json({ ok: true, token: jwt, url });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Issue failed" });
  }
}
