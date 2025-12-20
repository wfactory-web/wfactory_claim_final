// src/pages/api/debug-make-cert.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { makeCertToken } from "@/lib/certTokenServer";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenId = Number(req.query.tokenId || 18);
  const token = makeCertToken({ tokenId, ttlSeconds: 60 * 60 }); // 1 hour
  return res.status(200).json({
    ok: true,
    tokenId,
    token,
    certUrl: `http://localhost:3000/cert/${token}`,
  });
}
