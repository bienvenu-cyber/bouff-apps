import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const configuredApiImagePatterns = [
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://txyqwlatzlkurjrnlxhe.supabase.co",
  process.env.NEXT_PUBLIC_SERVER_URL,
  process.env.NEXT_PUBLIC_SINGLE_VENDOR_SERVER_URL,
  process.env.NEXT_PUBLIC_SINGLE_VENDOR_REST_URL,
]
  .map((value) => {
    if (!value) return null;

    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;

      return {
        protocol: url.protocol.slice(0, -1),
        hostname: url.hostname,
        port: url.port,
        pathname: "/**",
      };
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "connect-src 'self' https: wss: ws:",
  "frame-src 'self' https:",
  "media-src 'self' data: blob: https:",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // BOUFF : mono-restaurant par défaut, données servies par notre base.
  env: {
    NEXT_PUBLIC_VENDOR_MODE: process.env.NEXT_PUBLIC_VENDOR_MODE ?? "SINGLE",
    NEXT_PUBLIC_SINGLE_VENDOR_ENABLED:
      process.env.NEXT_PUBLIC_SINGLE_VENDOR_ENABLED ?? "true",
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "https://txyqwlatzlkurjrnlxhe.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3",
    NEXT_PUBLIC_BOUFF_RESTAURANT_SLUG:
      process.env.NEXT_PUBLIC_BOUFF_RESTAURANT_SLUG ?? "bouff",
    // Paiement Mobile Money en ligne (pawaPay) : false jusqu'à l'arrivée des clés
    NEXT_PUBLIC_PAWAPAY_ENABLED:
      process.env.NEXT_PUBLIC_PAWAPAY_ENABLED ?? "false",
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: "asset/resource",
      dependency: { not: ["url"] },
    });
    return config;
  },
  async headers() {
    return [
      {
        // Photos BOUFF : mises en cache 1 jour (CDN + téléphones), revalidées ensuite.
        source: "/bouff/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          // Optional: Add other security headers
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    dangerouslyAllowSVG: false,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "enatega.com",
      },
      {
        protocol: "https",
        hostname: "www.lifcobooks.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        hostname: "example.com",
        protocol: "https",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "t4.ftcdn.net",
      },
      {
        protocol: "https",
        hostname: "static.vecteezy.com",
      },
      {
        protocol: "https",
        hostname: "cdn-icons-png.flaticon.com",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      {
        protocol: "https",
        hostname: "images.deliveryhero.io",
      },
      {
        protocol: "https",
        hostname: "enatega-backend.s3.eu-north-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "assets.enatega.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      ...configuredApiImagePatterns,
    ],
  },
};
// export default withPWA(withNextIntl(nextConfig));
export default withNextIntl(nextConfig);
