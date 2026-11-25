/** @type {import('next').NextConfig} */
const nextConfig = {
  // Outside Vercel (for example shared hosting) a build has few processes and
  // little memory to spare: collect page data with one worker instead of one
  // per CPU, or the host kills the build.
  ...(process.env.VERCEL ? {} : { experimental: { cpus: 1 } }),
  // The app serves its few images as they are. The image optimizer is not
  // used, and middleware refuses its endpoint, so it cannot be reached.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
