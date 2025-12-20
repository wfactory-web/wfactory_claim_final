// src/lib/certRender.ts
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";

function shortAddr(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export async function renderCertificatePng(opts: {
  tokenId: number;
  nftContract: string;
  owner: string;          // for final download
  verified: boolean;      // preview shows UNVERIFIED
}) {
  const templatePath = path.join(process.cwd(), "public", "certificate", "dl_certificate.png");
  if (!fs.existsSync(templatePath)) {
    throw new Error("Missing template: public/certificate/dl_certificate.png");
  }

  const img = await loadImage(templatePath);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, w, h);

  // Cyberpunk watermark panel (bottom-right)
  //const pad = Math.max(28, Math.floor(w * 0.02));
  //const panelW = Math.floor(w * 0.52);
  //const panelH = Math.floor(h * 0.15);
  //const x = w - pad - panelW;
  //const y = h - pad - panelH;

  // glass bg
  //ctx.globalAlpha = 0.68;
  //ctx.fillStyle = "#070b10";
  //ctx.fillRect(x, y, panelW, panelH);

  // neon border
  //ctx.globalAlpha = 0.95;
  //ctx.lineWidth = Math.max(3, Math.floor(w * 0.003));
  //ctx.strokeStyle = "#00ff9a";
  //ctx.strokeRect(x, y, panelW, panelH);

  // tiny inner accent line
  //ctx.globalAlpha = 0.55;
  //ctx.strokeStyle = "#00aaff";
  //ctx.beginPath();
  //ctx.moveTo(x + 10, y + 12);
  //ctx.lineTo(x + panelW - 10, y + 12);
  //ctx.stroke();

  // text
  //ctx.globalAlpha = 0.95;
  //const fontSize = Math.max(20, Math.floor(w * 0.017));
  //ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
  //ctx.fillStyle = "#d9fff0";

  //const status = opts.verified ? "VERIFIED OWNER" : "UNVERIFIED PREVIEW";
  //const lines = [
  // `W FACTORY CERT • ${status}`,
  // `TokenId: ${opts.tokenId}`,
  //  `NFT: ${opts.nftContract}`,
  //  `Owner: ${opts.verified ? opts.owner : "CONNECT + VERIFY"}`,
  //  `Addr: ${opts.verified ? opts.owner : "—"}`,
  //];

  //let ty = y + Math.floor(fontSize * 1.6);
  //for (const line of lines) {
    //ctx.fillText(line, x + pad, ty);
    //ty += Math.floor(fontSize * 1.2);
  //}

  // subtle diagonal watermark text
  //ctx.save();
  //ctx.globalAlpha = 0.10;
  //ctx.translate(w * 0.52, h * 0.55);
  //ctx.rotate(-0.25);
  //ctx.font = `900 ${Math.floor(w * 0.06)}px ui-sans-serif, system-ui, Segoe UI, Arial`;
  //ctx.fillStyle = "#00ff9a";
  //ctx.fillText("W FACTORY", -Math.floor(w * 0.35), 0);
  //ctx.restore();

  return canvas.toBuffer("image/png");
}
