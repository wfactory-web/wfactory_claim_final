import type { NextApiRequest, NextApiResponse } from "next";
import { signCertToken } from "@/lib/certTokenServer";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // DEV ONLY: protect with a password so nobody can generate tokens in prod
    const pass = req.query.pass;
    if (!process.env.DEV_TOKEN_PASS || pass !== process.env.DEV_TOKEN_PASS) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const tokenId = Number(req.query.tokenId ?? "18");
    const chainId = Number(req.query.chainId ?? "137");
    const contract = String(req.query.contract ?? "");

    if (!contract || !contract.startsWith("0x")) {
      return res.status(400).json({ ok: false, error: "Missing contract" });
    }

    const secret = process.env.CERT_TOKEN_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "Missing CERT_TOKEN_SECRET" });

    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

    const token = signCertToken(
      { v: 1, tokenId, chainId, contract, exp, nonce },
      secret
    );

    const url = `http://localhost:3000/cert/${token}`;
    return res.status(200).json({ ok: true, token, url });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
}
