export function codeToTokenId(code: string):
  | { ok: true; tokenId: number }
  | { ok: false; error: string } {

  const c = (code || "").trim();

  // -----------------------------
  // OLD FORMAT
  // W-LIM-X-20-{n}-{20|120|200}
  // tokenId = n - 1
  // -----------------------------
  let m = /^W-LIM-X-20-(\d+)-(20|120|200)$/.exec(c);
  if (m) {
    const n = Number(m[1]);
    const max = Number(m[2]);

    if (!Number.isInteger(n)) return { ok: false, error: "Invalid number" };
    if (n < 1 || n > max) return { ok: false, error: `Out of range (1-${max})` };

    return { ok: true, tokenId: n - 1 };
  }

  // -----------------------------
  // NEW FORMAT (FINAL)
  // W-LIM-X-{tokenId}-200
  // tokenId = tokenId
  // -----------------------------
  m = /^W-LIM-X-(\d+)-200$/.exec(c);
  if (m) {
    const tokenId = Number(m[1]);

    if (!Number.isInteger(tokenId)) {
      return { ok: false, error: "Invalid tokenId" };
    }
    if (tokenId < 0 || tokenId >= 200) {
      return { ok: false, error: "TokenId out of range (0–199)" };
    }

    return { ok: true, tokenId };
  }

  return { ok: false, error: "Invalid code format" };
}
