import "dotenv/config";
import { ethers } from "ethers";

const rpc = process.env.POLYGON_RPC_URL;
const pk = process.env.MINT_SIGNER_PRIVATE_KEY;

if (!rpc) throw new Error("Missing POLYGON_RPC_URL");
if (!pk) throw new Error("Missing MINT_SIGNER_PRIVATE_KEY");

const provider = new ethers.JsonRpcProvider(rpc);
const w = new ethers.Wallet(pk, provider);

const bal = await provider.getBalance(w.address);
console.log("Relayer:", w.address);
console.log("Balance (POL):", ethers.formatEther(bal));
