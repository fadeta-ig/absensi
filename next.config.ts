import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // disable: process.env.NODE_ENV === "development",
  customWorkerDir: "worker",
});

const nextConfig: NextConfig = {
  /**
   * Webpack config — suppress Node.js-only module warnings dari face-api.js & TensorFlow.js.
   * Library ini mencoba import `fs` dan `encoding` yang tidak tersedia di browser bundle.
   * Solusi: fallback ke modul kosong (`false`) sehingga webpack tidak error.
   */
  webpack(config, { isServer }) {
    // face-api.js & @tensorflow/tfjs-core menggunakan node-fetch yang mencoba
    // import `encoding` (native addon). Fallback ke `false` mencegah webpack error
    // baik di server bundle maupun client bundle.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
      path: false,
      crypto: false,
      "node-fetch": false,
    };

    if (isServer) {
      // Hindari bundling face-api.js & tfjs di server — library ini hanya
      // untuk browser (WebGL, canvas, DOM). Mark sebagai external.
      const existingExternals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existingExternals) ? existingExternals : [existingExternals]),
        "face-api.js",
        "@tensorflow/tfjs-core",
        "@tensorflow/tfjs-backend-webgl",
      ];
    }

    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=*, geolocation=*, microphone=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);

