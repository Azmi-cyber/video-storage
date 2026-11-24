import { safeFetch } from "./net";
import { extract, extractOkRu, findIframes, SUB_EXT, VIDEO_EXT, type MediaRef, type SubRef } from "./extract";
import { parseHls, parseMpd } from "./hls";
import { unpackAll } from "./unpack";
import { browserCapture } from "./browser";

export const CREATOR = "Azmi Ganteng";
const UA = "Mozilla/5.0 (compatible; StreamUrlExtractor/1.0; +analysis-tool)";
const typeOf = (ext: string) =>
  ext === "m3u8" ? "hls" : ext === "mpd" ? "dash" : ["mp4", "m4v"].includes(ext) ? "mp4" : ext === "unknown" ? "unknown" : ext;

/** HTML + hasil unpack JS + maks 3 script eksternal milik halaman (analisis statis, tanpa menjalankan JS). */
async function gather(html: string, base: string, headers: Record<string, string>) {
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((m) => { try { return new URL(m[1], base).href; } catch { return ""; } })
    .filter((x) => x && !/(googletagmanager|google-analytics|jquery|bootstrap|cdnjs|jsdelivr|gstatic|facebook|doubleclick|cloudflareinsights)/i.test(x))
    .slice(0, 3);
  const parts = await Promise.all(srcs.map(async (s) => {
    try { const r = await safeFetch(s, { headers: { ...headers, Referer: base }, maxBytes: 800_000, timeout: 5000 }); return r.ok ? r.body + "\n" + unpackAll(r.body) : ""; }
    catch { return ""; }
  }));
  return html + "\n" + unpackAll(html) + "\n" + parts.join("\n");
}

export async function analyze(pageUrl: string, referer?: string, opts: { origin?: string; browser?: boolean } = {}) {
  let blocked = false;
  const t0 = Date.now();
  const diagnostics: string[] = [];
  const limitations: string[] = [];
  const out: any = {
    creator: CREATOR, success: false, source: null, page_url: pageUrl,
    page_fetch: null, video: { url: null, type: null, qualities: [] },
    sources: [], subtitles: [], limitations, diagnostics, status: "failed", error: null, elapsed_ms: 0,
  };
  const done = (status: string) => { out.status = status; out.elapsed_ms = Date.now() - t0; return out; };

  let u: URL;
  try { u = new URL(pageUrl); } catch { out.error = "URL tidak valid."; return done("failed"); }
  out.source = u.hostname.replace(/^www\./, "");

  const pageHeaders: Record<string, string> = {
    "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.8",
  };
  if (referer) pageHeaders.Referer = referer;

  let media: MediaRef[] = [];
  let subs: SubRef[] = [];
  const ext0 = (u.pathname.split(".").pop() || "").toLowerCase();

  try {
    if (VIDEO_EXT.includes(ext0)) { media.push({ url: u.href, ext: ext0, via: "input" }); diagnostics.push("Input adalah URL media langsung."); }
    else if (SUB_EXT.includes(ext0)) { subs.push({ url: u.href, ext: ext0, label: null, lang: null, kind: null, via: "input" }); }
    else {
      const page = await safeFetch(u.href, { headers: pageHeaders });
      out.page_fetch = { status: page.status, final_url: page.finalUrl, content_type: page.contentType, referer_sent: referer || null };
      if (!page.ok) {
        diagnostics.push(`Server sumber membalas HTTP ${page.status} untuk request dari backend.`);
        if ([401, 403, 404, 429].includes(page.status)) {
          limitations.push(
            "Halaman sumber menolak request ini. 'Not Found' pada akses langsung biasanya berasal dari validasi konteks embed di sisi server: " +
            "(1) header Referer/Origin harus dari domain yang diizinkan, (2) header Sec-Fetch-Dest/Sec-Fetch-Site yang dikirim browser berbeda antara tab dan iframe, " +
            "(3) cookie/sesi/token, atau (4) proteksi bot/IP (server cloud sering diblokir). Tool ini tidak menembus proteksi tersebut. " +
            "Jika Anda berwenang meng-embed halaman ini, isi kolom 'Referer' dengan domain Anda yang terdaftar.");
        }
        blocked = true;
      } else if (/mpegurl/i.test(page.contentType) || page.body.trimStart().startsWith("#EXTM3U")) media.push({ url: page.finalUrl, ext: "m3u8", via: "page" });
      else {
        const body = await gather(page.body, page.finalUrl, pageHeaders);
        const r = extract(body, page.finalUrl, "page");
        media.push(...r.media, ...extractOkRu(page.body, "page")); subs.push(...r.subs);
        // iframe bersarang (maks 2), dengan Referer = halaman induk seperti browser
        for (const f of findIframes(page.body, page.finalUrl).slice(0, 2)) {
          try {
            const res = await safeFetch(f, { headers: { ...pageHeaders, Referer: page.finalUrl } });
            diagnostics.push(`Iframe ${f} → HTTP ${res.status}`);
            if (res.ok) { const body2 = await gather(res.body, res.finalUrl, pageHeaders); const r2 = extract(body2, res.finalUrl, "iframe"); media.push(...r2.media, ...extractOkRu(res.body, "iframe")); subs.push(...r2.subs); }
          } catch (e: any) { diagnostics.push(`Iframe ${f} gagal: ${e.message}`); }
        }
        if (!media.length) limitations.push(
          "Tidak ada URL media di HTML/JS statis. Banyak player memuat sumber lewat request XHR/fetch saat runtime (butuh browser). " +
          "Backend serverless ini tidak menjalankan browser headless, jadi sumber seperti itu tidak bisa dideteksi. URL iframe/halaman embed BUKAN URL video.");
      }
    }
  } catch (e: any) {
    out.error = e.name === "AbortError" ? "Timeout saat mengambil halaman sumber." : e.message;
    return done("failed");
  }

  // Fallback otomatis: browser headless merekam request jaringan player (iframe pada halaman host).
  if (!media.length && opts.browser !== false && opts.origin && !VIDEO_EXT.includes(ext0) && !SUB_EXT.includes(ext0)) {
    try {
      let host = opts.origin;
      if (referer) { try { host = new URL(referer).origin; } catch {} }
      const cap = await browserCapture(u.href, host);
      diagnostics.push(`Mode browser (host embed: ${host}): ${cap.media.length} request media terekam.`);
      for (const m of cap.media) {
        if (SUB_EXT.includes(m.ext)) subs.push({ url: m.url, ext: m.ext, label: null, lang: null, kind: null, via: "browser" });
        else media.push({ url: m.url, ext: m.ext, via: "browser" });
      }
      for (const t of cap.texts) { const r = extract(t.body, t.url, "browser-xhr"); media.push(...r.media, ...extractOkRu(t.body, "browser-xhr")); subs.push(...r.subs); }
      if (media.length) { blocked = false; limitations.length = 0; }
    } catch (e: any) { diagnostics.push(`Mode browser gagal: ${e?.message || e}`); }
  }

  media = [...new Map(media.map((m) => [m.url, m])).values()].slice(0, 12);
  subs = [...new Map(subs.map((s) => [s.url, s])).values()].slice(0, 12);
  const mediaHeaders = { "User-Agent": UA, Accept: "*/*", Referer: referer || pageUrl };

  // Analisis tiap sumber (HLS/DASH) secara paralel
  const analyzed = await Promise.all(media.map(async (m, idx) => {
    const base: any = { url: m.url, format: m.ext, type: typeOf(m.ext), found_in: m.via, quality: (m as any).quality ?? null, accessible: null, http_status: null, kind: null, qualities: [], encryption: [], protected: false };
    if (idx >= 4 || !["m3u8", "mpd"].includes(m.ext)) {
      if (idx < 8 && m.ext !== "unknown") { try { const r = await safeFetch(m.url, { headers: { ...mediaHeaders, Range: "bytes=0-0" }, maxBytes: 512 }); base.accessible = r.status < 400; base.http_status = r.status; } catch { base.accessible = false; } }
      return base;
    }
    try {
      const r = await safeFetch(m.url, { headers: mediaHeaders, maxBytes: 600_000 });
      base.http_status = r.status; base.accessible = r.ok;
      if (!r.ok) { diagnostics.push(`Sumber ${m.url} → HTTP ${r.status}`); return base; }
      if (m.ext === "m3u8") {
        const h = parseHls(r.body, r.finalUrl);
        if (!h) { base.accessible = false; diagnostics.push(`Respons bukan playlist HLS valid: ${m.url}`); return base; }
        base.kind = h.kind; base.qualities = h.variants; base.encryption = h.encryption;
        base.hls_subtitles = h.subtitles; base.hls_audio = h.audio;
        base.protected = h.encryption.some((e: string) => !/^AES-128$/.test(e));
      } else {
        const d = parseMpd(r.body);
        base.kind = "mpd"; base.protected = d.protected;
        base.qualities = d.reps.filter((x) => x.height).map((x) => ({ ...x, url: null }));
      }
      if (base.protected) limitations.push(`Sumber ${m.url} memakai DRM/enkripsi (${base.encryption.join(", ") || "ContentProtection"}). Tool ini tidak memutar atau mendekripsi konten terproteksi.`);
    } catch (e: any) { base.accessible = false; diagnostics.push(`Sumber ${m.url} gagal diambil: ${e.name === "AbortError" ? "timeout" : e.message}`); }
    return base;
  }));

  // Subtitle dari tag/JS + dari master HLS
  const subMap = new Map<string, any>();
  for (const s of subs) subMap.set(s.url, { url: s.url, language: s.lang, label: s.label, kind: s.kind, format: s.ext, found_in: s.via, accessible: null, http_status: null });
  for (const a of analyzed) for (const t of a.hls_subtitles || []) if (t.url && !subMap.has(t.url))
    subMap.set(t.url, { url: t.url, language: t.lang, label: t.name, kind: "hls-media", format: "hls-webvtt-playlist", found_in: "hls-master", accessible: null, http_status: null });
  const subList = [...subMap.values()].slice(0, 12);
  await Promise.all(subList.map(async (s) => {
    try { const r = await safeFetch(s.url, { headers: mediaHeaders, maxBytes: 1024 }); s.accessible = r.ok; s.http_status = r.status; }
    catch { s.accessible = false; }
  }));

  // Pilih sumber utama
  const rank = (a: any) => (a.kind === "master" ? 0 : a.type === "hls" ? 1 : a.type === "mp4" ? 2 : a.type === "dash" ? 3 : 4) + (a.accessible === false ? 10 : 0);
  const primary = [...analyzed].sort((a, b) => rank(a) - rank(b))[0];
  out.sources = analyzed.map(({ hls_subtitles, hls_audio, ...rest }) => rest);
  out.subtitles = subList;
  if (primary) {
    out.video = { url: primary.url, type: primary.type, accessible: primary.accessible, playlist_kind: primary.kind, qualities: primary.qualities.map((q: any) => ({ ...q })) };
    if (primary.accessible === false) limitations.push("URL video ditemukan di halaman tetapi tidak bisa diakses dari backend (kemungkinan butuh Referer/token/cookie). Preview di browser mungkin juga gagal.");
  }
  out.success = !!primary;
  if (primary && !primary.qualities.length) {
    const prog = analyzed.filter((a) => a.quality && a.accessible !== false);
    if (prog.length > 1) out.video.qualities = prog.map((a) => ({ label: a.quality, url: a.url, width: null, height: null, bandwidth: null, codecs: null, frame_rate: null }));
  }
  return done(primary ? "completed" : blocked ? "blocked" : "no_sources_found");
}
