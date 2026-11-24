/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    // pastikan biner Chromium ikut dibundel ke serverless function
    outputFileTracingIncludes: { "/video/[...url]": ["./node_modules/@sparticuz/chromium/bin/**"] },
  },
};
export default nextConfig;
