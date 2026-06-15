import type { NextConfig } from "next";

const NGROK_HOST = process.env.NGROK_HOST ?? "";
const isProd = process.env.NODE_ENV === "production";
const APP_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL ?? "";

// Security headers applied to every response. CSP allows the app itself plus the
// few third parties it actually loads: Plaid Link (script + iframe) and the
// Anthropic API (XHR). 'unsafe-inline'/'unsafe-eval' remain for now because Next
// emits inline bootstrap scripts; tighten to nonce-based script-src in a later
// pass once verified against the live app. VERIFY Plaid Link still opens after
// any CSP change.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.plaid.com https://api.anthropic.com",
  "frame-src https://cdn.plaid.com https://*.plaid.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a minimal Docker
  // image on ECS Fargate — copies only the files + node_modules actually needed.
  output: "standalone",

  async headers() {
    const rules = [
      // Security headers on everything.
      { source: "/:path*", headers: securityHeaders },
    ];

    // CORS: the frontend and API are same-origin, so production needs NO
    // permissive CORS. Only emit cross-origin headers in non-production (for the
    // ngrok dev tunnel), and never `*` together with credentials (invalid + unsafe).
    if (!isProd) {
      rules.push({
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: APP_ORIGIN || NGROK_HOST || "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS,PATCH" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, ngrok-skip-browser-warning" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      });
    }

    return rules;
  },

  // Allow ngrok origin for Turbopack HMR websocket
  ...(NGROK_HOST ? { allowedDevOrigins: [NGROK_HOST] } : {}),
};

export default nextConfig;
