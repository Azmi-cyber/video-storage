export const VIDEO_EXT = ["m3u8", "mpd", "mp4", "webm", "mkv", "m4v"];
export const SUB_EXT = ["vtt", "srt", "ass", "ssa"];

export type MediaRef = { url: string; ext: string; via: string; quality?: string };
export type SubRef = { url: string; ext: string; label: string | null; lang: string | null; kind: string | null; via: string };

const norm = (s: string) =>
  s.replace(/\\\//g, "/").replace(/\\u002f/gi, "/").replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");

const extOf = (abs: string) => (new URL(abs).pathname.split(".").pop() || "").toLowerCase();

function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

const URL_SRC = "https?:\\/\\/[^\\s\"'<>\\\\`)]+?\\.(?:m3u8|mpd|mp4|webm|mkv|m4v|vtt|srt|ass|ssa)(?=[?#\"'\\s<>\\\\`)]|$)(?:[?#][^\\s\"'<>\\\\`)]*)?";

/** Ekstraksi statis dari HTML/JS. Hanya URL yang benar-benar tertulis di sumber. */
export function extract(raw: string, base: string, via: string) {
  const text = norm(raw);
  const media = new Map<string, MediaRef>();
  const subs = new Map<string, SubRef>();
  const resolve = (u: string) => { try { return new URL(u, base).href; } catch { return null; } };

  const addMedia = (u: string, ext?: string) => {
    const abs = resolve(u); if (!abs || !/^https?:/.test(abs)) return;
    if (!media.has(abs)) media.set(abs, { url: abs, ext: ext || extOf(abs), via });
  };
  const addSub = (u: string, meta: Partial<SubRef> = {}) => {
    const abs = resolve(u); if (!abs || !/^https?:/.test(abs)) return;
    if (!subs.has(abs)) subs.set(abs, { url: abs, ext: extOf(abs), label: null, lang: null, kind: null, via, ...meta });
  };

  // 1) objek JS ala {file:"x.vtt", label:"English", kind:"captions"}
  for (const m of text.matchAll(/\{[^{}]*\}/g)) {
    const obj = m[0];
    const u = obj.match(new RegExp(URL_SRC, "i"))?.[0];
    if (!u || !SUB_EXT.includes(extOf(u))) continue;
    const g = (k: string) => obj.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
    addSub(u, { label: g("label"), kind: g("kind"), lang: g("srclang") || g("lang") || g("language") });
  }
  // 2) tag HTML
  for (const m of text.matchAll(/<(?:video|source|track|audio)\b[^>]*>/gi)) {
    const a = attrs(m[0]); const src = a.src;
    if (!src || src.startsWith("blob:") || src.startsWith("data:")) continue;
    if (/^<track/i.test(m[0])) addSub(src, { label: a.label ?? null, lang: a.srclang ?? null, kind: a.kind ?? null });
    else {
      const hasExt = /\.\w{2,5}$/.test(src.split("?")[0]);
      addMedia(src, hasExt ? undefined : /mp4/.test(a.type || "") ? "mp4" : "unknown");
    }
  }
  // 3) semua URL absolut dengan ekstensi media
  for (const m of text.matchAll(new RegExp(URL_SRC, "gi"))) {
    const e = extOf(m[0]);
    if (SUB_EXT.includes(e)) addSub(m[0]); else addMedia(m[0], e);
  }
  return { media: [...media.values()], subs: [...subs.values()] };
}

export function findIframes(raw: string, base: string): string[] {
  const out: string[] = [];
  for (const m of raw.matchAll(/<iframe\b[^>]*>/gi)) {
    const s = attrs(m[0]).src; if (!s) continue;
    try { const u = new URL(s, base); if (/^https?:$/.test(u.protocol)) out.push(u.href); } catch {}
  }
  return [...new Set(out)];
}

const OK_Q: Record<string, string> = { mobile: "144p", lowest: "240p", low: "360p", sd: "480p", hd: "720p", full: "1080p", quad: "1440p", ultra: "2160p" };

/** ok.ru: data-options (JSON ter-escape HTML) berisi daftar video yang memang dipublikasikan di halaman. */
export function extractOkRu(raw: string, via: string): MediaRef[] {
  const out: MediaRef[] = [];
  const m = raw.match(/data-options="([^"]+)"/);
  if (!m) return out;
  try {
    const dec = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    let meta = JSON.parse(dec)?.flashvars?.metadata;
    if (typeof meta === "string") meta = JSON.parse(meta);
    if (!meta) return out;
    for (const k of ["hlsManifestUrl", "ondemandHls", "hlsMasterPlaylistUrl"]) if (meta[k]) out.push({ url: meta[k], ext: "m3u8", via });
    for (const v of meta.videos || []) if (v.url) out.push({ url: v.url, ext: "mp4", via, quality: OK_Q[v.name] || v.name });
  } catch {}
  return out;
}
