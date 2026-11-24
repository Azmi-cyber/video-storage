# Video-storage — by Azmi Ganteng

API JSON: `GET /video/<url>` → analisis sumber video (m3u8/mp4/mpd), subtitle, kualitas.

```bash
npm install
npm run build
npm run dev          # lokal: set CHROME_PATH=/path/ke/chrome agar mode browser jalan
```

Deploy Vercel: push ke GitHub → Import. Node.js harus 20.x (sudah diatur di package.json). Mode browser butuh function 60 detik.
Parameter: `?referer=https://domain-anda.com/` (opsional, domain milik Anda), `?browser=0` (matikan mode browser).
