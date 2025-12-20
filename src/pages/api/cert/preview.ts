// src/pages/api/cert/preview.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyCertToken } from "@/lib/verifyCertToken";
import { renderCertificatePng } from "@/lib/certRender";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const secret = process.env.CERT_TOKEN_SECRET || "";
    if (!secret) throw new Error("Missing CERT_TOKEN_SECRET");

    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

    const payload = verifyCertToken(token, secret);

    // Strict: preview still verifies token integrity + expiry
    const buf = await renderCertificatePng({
      tokenId: Number(payload.tokenId),
      nftContract: String(payload.contract),
      owner: "0x0000000000000000000000000000000000000000",
      verified: false,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Invalid token" });
  }
}
