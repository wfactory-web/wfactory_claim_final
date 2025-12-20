// pages/api/check-nfc.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { NFC_ALLOWLIST } from "@/lib/nfc/nfcAllowlist";

type Resp =
  | { ok: true; authorized: true; tokenId: number; nfcHash: string; used?: boolean }
  | { ok: false; authorized?: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  try {
    const code = String(req.query.code || "").trim();
    const p = String(req.query.p || "").trim();

    if (!code) return res.status(200).json({ ok: false, error: "Missing code" });
    if (!p) return res.status(200).json({ ok: false, error: "Missing p" });

    const row = (NFC_ALLOWLIST as any)[code];
    if (!row) return res.status(200).json({ ok: false, authorized: false, error: "Not authorized" });

    if (row.p !== p) return res.status(200).json({ ok: false, authorized: false, error: "Not authorized" });

    // nfcHash: deterministic hash of (code|p). You can change salt later if you want.
    const nfcHash = ethers.keccak256(ethers.toUtf8Bytes(`${code}|${p}`));

    return res.status(200).json({
      ok: true,
      authorized: true,
      tokenId: Number(row.tokenId),
      nfcHash,
      used: false, // (optional) set true if you implement "used" tracking
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
