import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const contractAddress = String(req.query.contractAddress || "").trim();
    const tokenIdStr = String(req.query.tokenId || "").trim();

    if (!ethers.isAddress(contractAddress)) {
      return res.status(400).json({ ok: false, error: "Invalid contractAddress" });
    }
    if (!/^\d+$/.test(tokenIdStr)) {
      return res.status(400).json({ ok: false, error: "Invalid tokenId" });
    }

    const tokenId = BigInt(tokenIdStr);

    const rpc = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(rpc);

    // Your contract has: function exists(uint256 tokenId) external view returns (bool)
    const contract = new ethers.Contract(
      contractAddress,
      ["function exists(uint256 tokenId) view returns (bool)"],
      provider
    );

    const exists: boolean = await contract.exists(tokenId);

    return res.status(200).json({ ok: true, exists });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }

  
}
