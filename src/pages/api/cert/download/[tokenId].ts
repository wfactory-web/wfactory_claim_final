import type { NextApiRequest, NextApiResponse } from "next";
import { verifyCertLink } from "@/lib/certToken";

type Ok = { ok: true; tokenId: number; message: string };
type Fail = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const tokenIdRaw = req.query.tokenId;
    if (!tokenIdRaw || Array.isArray(tokenIdRaw)) {
      return res.status(400).json({ ok: false, error: "Missing tokenId" });
    }

    const tokenId = Number(tokenIdRaw);
    if (!Number.isFinite(tokenId)) {
      return res.status(400).json({ ok: false, error: "Invalid tokenId" });
    }

    // Expect a signed token in query: /api/cert/download/14?t=TOKEN
    const t = req.query.t;
    if (!t || Array.isArray(t)) {
      return res.status(400).json({ ok: false, error: "Missing t (cert token)" });
    }

    // Verify signature + exp using CERT_LINK_SECRET
    const payload = verifyCertLink(t);

    // Ensure token matches the path tokenId
    if (payload.tokenId !== tokenId) {
      return res.status(403).json({ ok: false, error: "TokenId mismatch" });
    }

    // ✅ Build passes now. (Later we’ll generate/stream the certificate file here.)
    return res.status(200).json({
      ok: true,
      tokenId,
      message: "Cert token valid. Next step: stream/download the certificate file.",
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Bad request" });
  }
}
