// src/lib/sendClaimEmail.ts
import { Resend } from "resend";
import * as QRCode from "qrcode";

type SendClaimEmailArgs = {
  toEmail: string;

  tokenId: string;
  wallet: string;
  networkName: string;     // "POLYGON"
  contractAddress: string; // your ERC721 contract
  txHash: string;

  viewUrl: string;         // OpenSea link (QR points here)
  downloadPageUrl: string; // ✅ /cert/<token> (secure)
  heroImageUrl: string;    // your 2000x2000 certificate image (https)
};

export async function sendClaimEmail(args: SendClaimEmailArgs) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing EMAIL_FROM");

  const resend = new Resend(resendKey);

  const qrDataUrl = await QRCode.toDataURL(args.viewUrl, {
    margin: 1,
    width: 260,
  });

  const shortWallet =
    args.wallet.length > 12
      ? `${args.wallet.slice(0, 6)}...${args.wallet.slice(-4)}`
      : args.wallet;

  const subject = `W FACTORY — Ownership Confirmed (Token #${args.tokenId})`;

  const html = `
  <div style="background:#0b0f14;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#e9f0ff;">
    <div style="max-width:760px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:18px;overflow:hidden;">
      
      <div style="padding:18px 18px 10px;border-bottom:1px solid rgba(255,255,255,0.10);">
        <div style="font-weight:900;letter-spacing:0.18em;font-size:12px;opacity:0.9;">
          W FACTORY • PHYGITAL SYSTEM
        </div>
        <div style="margin-top:10px;font-size:22px;font-weight:900;line-height:1.2;">
          CONGRATULATIONS — YOU ARE THE OWNER OF<br/>
          <span style="color:#00ffd2;">LOST IN MULTIVERSE FIRST EDITION DROP</span>
        </div>
      </div>

      <div style="padding:18px;">
        <div style="display:block;text-align:center;margin-bottom:16px;">
          ${
            args.heroImageUrl
              ? `<img src="${args.heroImageUrl}" alt="Certificate" style="width:100%;max-width:520px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />`
              : ""
          }
        </div>

        <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;align-items:flex-start;">
          
          <div style="flex:1;min-width:260px;max-width:340px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px;">
            <div style="font-weight:900;margin-bottom:10px;">VIEW NFT</div>
            <div style="text-align:center;">
              <img src="${qrDataUrl}" alt="QR Code" style="width:220px;height:220px;border-radius:10px;background:#fff;padding:10px;" />
              <div style="margin-top:10px;">
                <a href="${args.viewUrl}" target="_blank"
                   style="display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#e9f0ff;text-decoration:none;font-weight:800;">
                  OpenSea — View NFT
                </a>
              </div>
            </div>
          </div>

          <div style="flex:1;min-width:260px;max-width:340px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px;">
            <div style="font-weight:900;margin-bottom:10px;">DOWNLOAD OWNERSHIP</div>
            <div style="opacity:0.85;font-size:13px;line-height:1.6;">
              Token ID: <b>#${args.tokenId}</b><br/>
              Wallet: <b>${shortWallet}</b><br/>
              Network: <b>${args.networkName}</b><br/>
              Contract: <b style="word-break:break-all;">${args.contractAddress}</b><br/>
              Tx: <b style="word-break:break-all;">${args.txHash}</b>
            </div>

            <div style="margin-top:14px;">
              <a href="${args.downloadPageUrl}" target="_blank"
                 style="display:inline-block;width:100%;text-align:center;padding:12px 14px;border-radius:12px;border:1px solid rgba(0,255,210,0.28);background:rgba(0,255,210,0.08);color:#eaffff;text-decoration:none;font-weight:900;letter-spacing:0.10em;">
                DOWNLOAD CERTIFICATE
              </a>
            </div>

            <div style="margin-top:10px;opacity:0.65;font-size:11px;line-height:1.4;">
              Security: You must connect your wallet + sign a message to prove ownership before download.
            </div>
          </div>

        </div>

        <div style="margin-top:18px;opacity:0.75;font-size:12px;text-align:center;">
          We Don't Follow The Future, We Manufacture It.
        </div>
      </div>
    </div>
  </div>
  `;

  await resend.emails.send({
    from,
    to: args.toEmail,
    subject,
    html,
  });
}
