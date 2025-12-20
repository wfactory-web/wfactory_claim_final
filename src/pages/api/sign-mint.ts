// src/pages/api/sign-mint.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import crypto from "crypto";
import { getPolygonProvider } from "@/lib/polygonProvider";
import { createCertToken } from "@/lib/certTokenServer";
type Ready = {
  ok: true;
  status: "ready";
  req: {
    to: string;
    tokenId: string;
    uri: string;
    nfcHash: `0x${string}`;
    validUntil: string;
    uid: `0x${string}`;
  };
  sig: `0x${string}`;
  certToken: string;
};

type AlreadyClaimed = {
  ok: false;
  status: "already_claimed";
  tokenId: string;
  owner: string;
  certToken: string;
};

type Fail = {
  ok: false;
  status: "error";
  error: string;
  got?: string;
  len?: number;
};

type ApiResponse = Ready | AlreadyClaimed | Fail;

function isPkHex32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}
function isBytes32(s: any): s is `0x${string}` {
  return typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, status: "error", error: "Method not allowed" });
    }

    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return res.status(500).json({ ok: false, status: "error", error: "NEXT_PUBLIC_CONTRACT_ADDRESS missing" });
    }

    const pkRaw = (process.env.MINT_SIGNER_PRIVATE_KEY ?? "").trim();
    if (!isPkHex32(pkRaw)) {
      return res.status(500).json({
        ok: false,
        status: "error",
        error: "MINT_SIGNER_PRIVATE_KEY must be 0x + 64 hex chars (no quotes).",
        got: pkRaw ? "present but invalid" : "missing",
        len: pkRaw.length,
      });
    }

    const { to, tokenId, uri, nfcHash, validUntil } = req.body ?? {};

    if (!to || !ethers.isAddress(String(to))) {
      return res.status(400).json({ ok: false, status: "error", error: "Invalid 'to' address" });
    }
    if (tokenId === undefined || tokenId === null || String(tokenId) === "") {
      return res.status(400).json({ ok: false, status: "error", error: "Missing tokenId" });
    }
    if (!uri || typeof uri !== "string") {
      return res.status(400).json({ ok: false, status: "error", error: "Missing uri" });
    }
    if (!isBytes32(nfcHash)) {
      return res.status(400).json({ ok: false, status: "error", error: "nfcHash must be bytes32 (0x + 64 hex)" });
    }
    if (!validUntil || !/^\d+$/.test(String(validUntil))) {
      return res.status(400).json({ ok: false, status: "error", error: "Missing/invalid validUntil (unix seconds)" });
    }

    const tokenIdBig = BigInt(String(tokenId));
    const validUntilBig = BigInt(String(validUntil));
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (validUntilBig <= now) {
      return res.status(400).json({ ok: false, status: "error", error: "validUntil must be in the future" });
    }

    // already minted check
    const provider = getPolygonProvider();
    const nft = new ethers.Contract(
      contractAddress,
      ["function ownerOf(uint256 tokenId) view returns (address)"],
      provider
    );

    try {
    const owner = await nft.ownerOf(tokenIdBig);
    const certToken = createCertToken({
    tokenId: Number(tokenIdBig),
    chainId: 137,
    contract: contractAddress as `0x${string}`,
    ttlSec: 60 * 30,
  });

  return res.status(200).json({
    ok: false,
    status: "already_claimed",
    tokenId: String(tokenIdBig),
    owner: String(owner),
    certToken, // ✅ ADD
  });
} catch {
      // not minted yet, continue
    }

    // EIP-712 sign
    const uid = ("0x" + crypto.randomBytes(32).toString("hex")) as `0x${string}`;

    //const domainName = process.env.SIGNATURE_DOMAIN_NAME || "LostInMultiversePhygitalWearDrop";
    //const domainVersion = process.env.SIGNATURE_DOMAIN_VERSION || "1";

    const domain: ethers.TypedDataDomain = {
    name: "Lost In Multiverse Phygital Wear Drop",
    version: "1",
    chainId: 137,
    verifyingContract: contractAddress,
};

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "uri", type: "string" },
        { name: "nfcHash", type: "bytes32" },
        { name: "validUntil", type: "uint256" },
      ],
    } satisfies Record<string, ethers.TypedDataField[]>;

    const mintReq = {
      to: String(to),
      tokenId: tokenIdBig,
      uri,
      nfcHash,
      validUntil: validUntilBig,
      uid,
    };

    // NOTE: uid is NOT in your mintSigned UI — only keep uid if your Solidity includes it.
    // If your Solidity MintRequest does NOT include uid, remove uid from mintReq + types + response.

    const signer = new ethers.Wallet(pkRaw);
    const sig = (await signer.signTypedData(domain, types, mintReq)) as `0x${string}`;
    const certToken = createCertToken({
    tokenId: Number(tokenIdBig),
    chainId: 137,
    contract: contractAddress as `0x${string}`,
    ttlSec: 60 * 30,
  });

return res.status(200).json({
  ok: true,
  status: "ready",
  req: {
    to: mintReq.to,
    tokenId: String(tokenIdBig),
    uri: mintReq.uri,
    nfcHash: mintReq.nfcHash,
    validUntil: String(validUntilBig),
    uid,
  },
  sig,
  certToken, // ✅ ADD
  });
  } catch (e: any) {
    return res.status(500).json({ ok: false, status: "error", error: e?.message || "Server error" });
  }
}
