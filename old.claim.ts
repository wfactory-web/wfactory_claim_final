import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import crypto from "crypto";

const CHAIN_ID = 137;
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xD97a98f21f81Cba394A57F5C40D01367801eC284";

// MUST match contract eip712Domain()
const DOMAIN_NAME = "WFactorySignatureMint721";
const DOMAIN_VERSION = "1";

// metadata base
const METADATA_CID =
  process.env.METADATA_CID || "QmbZtKRuiJwBgE4xJuAAHrCM8RUhr1N3sV55yjiKMD8uQR";

function sha256Bytes32(input: string): `0x${string}` {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return (`0x${hex}`) as `0x${string}`;
}

// Parse token number from code: W-LIM-X-20-19-20 -> 19 -> tokenId=18
function codeToTokenIdServer(code: string): number {
  const parts = code.split("-").map((p) => p.trim());
  if (parts.length < 2) return NaN;

  // last part is usually "20", take the one before it
  const n = Number(parts[parts.length - 2]);
  if (!Number.isFinite(n)) return NaN;

  return n - 1; // code 15 -> tokenId 14
}

const mintSignedAbi = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function mintSigned((address to,uint256 tokenId,string uri,bytes32 nfcHash,uint256 validUntil) req, bytes sig) external",
];

type Ok = {
  ok: true;
  txHash: string;
  tokenId: number;
  openSeaUrl: string;
};

type Fail = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { code, to } = req.body as { code?: string; to?: string };

    const rawCode = String(code || "").trim();
    if (!rawCode) return res.status(400).json({ ok: false, error: "Missing code" });

    if (!to || !ethers.isAddress(to)) {
      return res.status(400).json({ ok: false, error: "Missing/invalid to address" });
    }

    const rpc = process.env.POLYGON_RPC_URL;
    const pk = process.env.MINT_SIGNER_PRIVATE_KEY; // relayer pays gas
    if (!rpc) return res.status(500).json({ ok: false, error: "Missing POLYGON_RPC_URL" });
    if (!pk) return res.status(500).json({ ok: false, error: "Missing MINT_SIGNER_PRIVATE_KEY" });

    const provider = new ethers.JsonRpcProvider(rpc);
    const relayer = new ethers.Wallet(pk, provider);

    const tokenId = codeToTokenIdServer(rawCode);
    if (!Number.isFinite(tokenId) || tokenId < 0 || tokenId > 119) {
      return res.status(400).json({ ok: false, error: "Invalid code/token mapping" });
    }

    const contract = new ethers.Contract(CONTRACT_ADDRESS, mintSignedAbi, relayer);

    // block if already minted
    try {
      const owner = await contract.ownerOf(BigInt(tokenId));
      return res.status(409).json({ ok: false, error: `Already claimed (owner=${owner})` });
    } catch {
      // not minted -> ownerOf reverts -> ok
    }

    const nfcHash = sha256Bytes32(rawCode);
    const validUntil = Math.floor(Date.now() / 1000) + 3 * 60 * 60; // 3 hours
    const uri = `ipfs://${METADATA_CID}/${tokenId}.json`;

    const domain = {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT_ADDRESS,
    };

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "uri", type: "string" },
        { name: "nfcHash", type: "bytes32" },
        { name: "validUntil", type: "uint256" },
      ],
    };

    // IMPORTANT: use BigInt for uint256 values in ethers v6 typed data
    const value = {
      to,
      tokenId: BigInt(tokenId),
      uri,
      nfcHash,
      validUntil: BigInt(validUntil),
    };

    const sig = (await relayer.signTypedData(domain, types, value)) as `0x${string}`;

    const tx = await contract.mintSigned(value, sig);
    const receipt = await tx.wait();

    const txHash = receipt?.hash || tx.hash;
    const openSeaUrl = `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${tokenId}`;

    return res.status(200).json({ ok: true, txHash, tokenId, openSeaUrl });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.shortMessage || e?.message || "Server error" });
  }
}
