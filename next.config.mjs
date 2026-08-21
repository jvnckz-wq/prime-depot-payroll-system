/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

// Content Security Policy.
//
// The two 'unsafe-inline' entries below are deliberate, not oversights:
//
//  * style-src — the entire design system is built on React inline `style={{}}`
//    props, which the browser sees as `style="..."` attributes. CSP blocks those
//    under style-src, and a nonce CANNOT whitelist a style *attribute* — only a
//    <style> element. Removing this would mean rewriting every component to use
//    classes, which is a much larger job than a security header.
//
//  * script-src — Next.js emits inline bootstrap scripts on every render. The
//    strong alternative is a per-request nonce with 'strict-dynamic', which this
//    version of Next.js supports through a proxy.js file (see
//    node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md —
//    note middleware is called "Proxy" in Next 16). It was not taken here
//    because it forces every page into dynamic rendering, and it needs a real
//    browser to verify. Worth revisiting once there is a staging deploy to test
//    against; the payoff is blocking injected inline scripts outright.
//
// What this policy does buy, even with both of those:
//
//    default-src 'self'   nothing loads from another origin
//    connect-src 'self'   a script cannot POST stolen payroll data elsewhere
//    object-src 'none'    no plugin content
//    base-uri 'self'      no <base> injection to hijack relative URLs
//    form-action 'self'   no form can submit to an attacker's server
//    frame-ancestors      clickjacking, belt-and-braces with X-Frame-Options
//
// img-src allows data: because profile pictures are stored as base64 data URLs
// (see the Employee/User schema notes). Fonts are self-hosted: next/font/google
// downloads Inter and Source Serif at build time, so no external font origin is
// needed at runtime.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig = {
  // Drop the `X-Powered-By: Next.js` banner. It tells an attacker which
  // framework and therefore which advisories to try, and buys nothing.
  poweredByHeader: false,

  // Defense-in-depth headers on every response. This is a payroll app that
  // holds employee PII, so we deny framing (clickjacking), stop MIME sniffing,
  // trim the referrer sent to other sites, and switch off browser features the
  // app never uses.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Tells the browser to refuse plain HTTP for this domain for two
          // years, including on the very first request of a later visit.
          // Vercel sets its own HSTS on *.vercel.app, but declaring it here
          // means the protection survives a move to another host.
          //
          // Note the tradeoff before adding `preload`: getting a domain OFF
          // the browser preload list takes months, so only add it once the
          // domain is certain to stay HTTPS-only forever.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Severs the window.opener relationship with anything that opens this
          // app, so another tab cannot reach into it.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
