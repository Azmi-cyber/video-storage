import { NextRequest } from "next/server";
import { analyze, CREATOR } from "@/lib/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const H = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};
const send = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2) + "\n", { status, headers: H });

export async function GET(req: NextRequest) {
  let raw = req.nextUrl.pathname.replace(/^\/video\//, "");
  try { raw = decodeURIComponent(raw); } catch {}
  // proxy/server sering menyatukan "https://" menjadi "https:/"
  let target = raw.replace(/^(https?):\/+/i, "$1://");
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;

  const sp = new URLSearchParams(req.nextUrl.search);
  const referer = sp.get("referer");
  sp.delete("referer");
  const useBrowser = sp.get("browser") !== "0";
  sp.delete("browser");
  const qs = sp.toString();
  if (qs) target += (target.includes("?") ? "&" : "?") + qs;

  try {
    const data = await analyze(target, referer?.trim() || undefined, { origin: req.nextUrl.origin, browser: useBrowser });
    return send(data, data.error?.includes("tidak valid") ? 400 : 200);
  } catch (e: any) {
    return send({ creator: CREATOR, success: false, page_url: target, status: "failed", error: e?.message || "Kesalahan internal." }, 500);
  }
}
