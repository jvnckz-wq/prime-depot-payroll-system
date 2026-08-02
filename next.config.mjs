/** @type {import('next').NextConfig} */
const nextConfig = {
  // Defense-in-depth headers on every response. This is a payroll app that
  // holds employee PII, so we deny framing (clickjacking), stop MIME sniffing,
  // trim the referrer sent to other sites, and switch off browser features the
  // app never uses.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
