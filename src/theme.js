/* ============================= DESIGN TOKENS ============================= */
// Prime Depot crimson identity. The brand crimson (#C8161D — the actual shop color) is the
// system's primary accent. `amber` is kept as a NAMED token but repurposed as the
// warning/attention/palima tone so hierarchy survives (not everything is red). Blue is
// retired: `blue`/`blueBg` alias neutral slate so any leftover callers stay legible.
export const T = {
  bg: '#F6F4F3', surface: '#FFFFFF', ink: '#1B2430', soft: '#5B6472',
  line: '#DED9D7', lineSoft: '#ECE7E5',
  // primary brand accent (was amber) — used for buttons, active nav, links, NET SALARY
  amber: '#C8161D', amberBg: '#FCEAEA',
  brand: '#C8161D', brandDark: '#9C1117', brandBg: '#FCEAEA',
  // warning / attention / absent / palima bonus
  warn: '#B5701C', warnBg: '#FBF1E2',
  green: '#3E6350', greenBg: '#E7F0E9',
  // 'blue' retired -> neutral slate alias (kept so existing references remain valid)
  blue: '#5B6472', blueBg: '#EEEBE9',
  red: '#A6402F', redBg: '#F6E7E4',
  sidebar: '#9C1117', sidebarLine: 'rgba(255,255,255,0.14)', sidebarSoft: '#EBB9BB',
};
// Single-family Inter across the whole app; weight carries the hierarchy (400 body,
// 500 medium, 600 semibold, 700 headings). Numbers render in Inter with tabular figures
// (see .pd-num in globals.css). A serif is reserved ONLY for the payslip letterhead.
// Fonts are loaded via next/font in app/layout.js, exposed as CSS variables.
export const F_HEAD = 'var(--font-inter), system-ui, sans-serif';
export const F_BODY = 'var(--font-inter), system-ui, sans-serif';
export const F_MONO = 'var(--font-inter), system-ui, sans-serif';
export const F_SERIF = "var(--font-source-serif), Georgia, 'Times New Roman', serif";
// Kept as a no-op so existing <style>{FONTS}</style> injections stay valid without edits;
// actual loading now happens in app/layout.js (next/font, self-hosted, no layout shift).
export const FONTS = '';
