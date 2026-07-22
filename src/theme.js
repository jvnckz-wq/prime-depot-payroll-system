/* ============================= DESIGN TOKENS ============================= */
// Prime Depot red identity. The brand crimson (#B51318 — the actual shop color) is the
// system's primary accent, replacing the old amber. `amber` is kept as a NAMED token but
// repurposed as the warning/attention/palima tone so hierarchy survives (not everything is
// red). Blue is retired: `blue`/`blueBg` now alias neutral slate so any leftover callers stay
// legible without introducing a competing hue.
export const T = {
  bg: '#F6F4F3', surface: '#FFFFFF', ink: '#1B2430', soft: '#5B6472',
  line: '#DED9D7', lineSoft: '#ECE7E5',
  // primary brand accent (was amber) — used for buttons, active nav, links, NET SALARY
  amber: '#B51318', amberBg: '#FBE9E8',
  brand: '#B51318', brandDark: '#8E0F14', brandBg: '#FBE9E8',
  // warning / attention / absent / palima bonus
  warn: '#B5701C', warnBg: '#FBF1E2',
  green: '#3E6350', greenBg: '#E7F0E9',
  // 'blue' retired -> neutral slate alias (kept so existing references remain valid)
  blue: '#5B6472', blueBg: '#EEEBE9',
  red: '#A6402F', redBg: '#F6E7E4',
  sidebar: '#8E0F14', sidebarLine: 'rgba(255,255,255,0.14)', sidebarSoft: '#E7B4B6',
};
export const F_HEAD = "'IBM Plex Sans Condensed', sans-serif";
export const F_BODY = "'IBM Plex Sans', sans-serif";
export const F_MONO = "'IBM Plex Mono', monospace";
export const FONTS = "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";
