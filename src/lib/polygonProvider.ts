import { ethers } from "ethers";

export function getPolygonProvider() {
  const urls = (process.env.POLYGON_RPC_URLS || "").split(",");

  if (!urls.length || !urls[0]) {
    throw new Error("Missing POLYGON_RPC_URLS");
  }

  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url.trim());
      return provider;
    } catch (e) {
      console.warn("RPC failed, trying next:", url);
    }
  }

  throw new Error("All Polygon RPC endpoints failed");
}
