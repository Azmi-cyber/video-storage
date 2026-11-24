import puppeteer from "puppeteer-core";
import { assertPublic } from "./net";

const MEDIA_RE = /\.(m3u8|mpd|mp4|webm|mkv|m4v|vtt|srt|ass|ssa)(?=[?#]|$)/i;
const CT_EXT: [RegExp, string][] = [[/mpegurl/i, "m3u8"], [/dash\+xml/i, "mpd"], [/text\/vtt/i, "vtt"], [/video\/mp4/i, "mp4"], [/video\/webm/i, "webm"]];

export type Captured = { media: { url: string; ext: string }[]; texts: { url: string; body: string }[] };

/**
 * Membuka halaman embed di dalam iframe pada halaman host (seperti situs yang meng-embed),
 * lalu merekam request jaringan yang dibuat player. Tidak menjalankan DRM dan tidak memalsukan token.
 */
export async function browserCapture(target: string, hostOrigin: string, budgetMs = 15000): Promise<Captured> {
  // Paksa deteksi runtime Node 20 supaya library sistem (libnss3 dkk) ikut diekstrak ke /tmp
  if (!process.env.CHROME_PATH) {
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  const executablePath = process.env.CHROME_PATH || (await chromium.executablePath());
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--autoplay-policy=no-user-gesture-required"],
    executablePath, headless: true, defaultViewport: { width: 1280, height: 720 },
  });
  const media = new Map<string, string>();
  const texts: Captured["texts"] = [];
  try {
    const page = await browser.newPage();
    const hostUrl = hostOrigin.replace(/\/+$/, "") + "/";
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const u = req.url();
      if (u === hostUrl) {
        return req.respond({ status: 200, contentType: "text/html",
          body: `<!doctype html><body style="margin:0"><iframe src="${target.replace(/"/g, "%22")}" allow="autoplay; fullscreen" style="width:100vw;height:100vh;border:0"></iframe>` });
      }
      if (!/^https?:/i.test(u)) return req.continue();
      try { await assertPublic(new URL(u)); } catch { return req.abort(); }
      if (["image", "font", "stylesheet"].includes(req.resourceType())) return req.abort();
      req.continue();
    });
    page.on("response", async (res) => {
      try {
        const u = res.url(); const ct = res.headers()["content-type"] || "";
        const byUrl = u.match(MEDIA_RE)?.[1]?.toLowerCase();
        const byCt = CT_EXT.find(([re]) => re.test(ct))?.[1];
        if (byUrl || byCt) { media.set(u, byUrl || byCt!); return; }
        const rt = res.request().resourceType();
        if ((rt === "xhr" || rt === "fetch" || rt === "script") && /json|text|javascript/i.test(ct)) {
          const body = await res.text();
          if (body.length < 500_000) texts.push({ url: u, body });
        }
      } catch {}
    });

    await page.goto(hostUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const t0 = Date.now(); let found = 0;
    while (Date.now() - t0 < budgetMs) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = Math.round((Date.now() - t0) / 1000);
      if (s === 3 || s === 6) await page.mouse.click(640, 360).catch(() => {});
      for (const f of page.frames()) f.evaluate(() => { const v = document.querySelector("video"); if (v) { v.muted = true; v.play().catch(() => {}); } }).catch(() => {});
      const hasVideo = [...media.values()].some((e) => ["m3u8", "mpd", "mp4", "webm"].includes(e));
      if (hasVideo && !found) found = Date.now();
      if (found && Date.now() - found > 2500) break; // beri waktu sebentar untuk subtitle
    }
  } finally { await browser.close().catch(() => {}); }
  return { media: [...media].map(([url, ext]) => ({ url, ext })), texts };
}
