import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pk = (process.env.MINT_SIGNER_PRIVATE_KEY || "").trim();
  const rpc = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
  const ca = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk);

  const contract = new ethers.Contract(ca, ["function signer() view returns (address)"], provider);
  const onchainSigner = await contract.signer();

  res.status(200).json({
    localSignerFromPK: wallet.address,
    onchainSigner,
    match: wallet.address.toLowerCase() === String(onchainSigner).toLowerCase(),
  });
}
