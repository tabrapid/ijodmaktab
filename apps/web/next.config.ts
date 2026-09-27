import type { NextConfig } from 'next';

/** API manzili: veb-server so‘rovlarni shu yerga proksi qiladi (brauzer uchun bitta manba). */
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Test paytida kamera, mikrofon va joylashuv so‘ralmaydi (reja, 8-bo‘lim).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // proxy.ts ishlatilganda so‘rov tanasi shu hajmgacha buferlanadi. API chegarasidan (10 MB) biroz katta
    // bo‘lishi kerak — aks holda katta fayl kesilib, API aniq “hajm katta” xabari o‘rniga xato qaytaradi.
    proxyClientMaxBodySize: '16mb',
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
