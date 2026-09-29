// Acknowledgment slip for a loan, a top-up, or a cash advance (Phase 3).
//
// A deduction from wages should rest on the employee's written consent (Labor
// Code Art. 113; verify the exact basis before citing it). This slip is that
// consent on paper: what was received, how it will be deducted, what happens
// when a payroll is short, and that any balance left comes out of final pay.
// The employee signs it; the Operations Head keeps it.
//
// It prints from a hidden iframe with its own small stylesheet, so it looks the
// same whatever page is open underneath and never picks up the app's layout.

import { pesoText, shortDate } from '../../lib/loan-rules';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TITLES = { LOAN: 'LOAN ACKNOWLEDGMENT', TOPUP: 'LOAN TOP-UP ACKNOWLEDGMENT', CASH_ADVANCE: 'CASH ADVANCE ACKNOWLEDGMENT' };

// The consent paragraph, in plain words the employee can check against the
// numbers above it. Crew are paid daily and are never stacked (Phase 2), so
// their "short day" sentence differs from staff.
function consentText(s) {
  const who = `I, <b>${esc(s.name)}</b>,`;
  const finalPay = 'If I leave the company before this is fully paid, I authorize Prime Depot Hardware to deduct the remaining balance from my final pay.';
  if (s.kind === 'CASH_ADVANCE') {
    return `${who} acknowledge that I received a cash advance of <b>${pesoText(s.amount)}</b> on ${esc(shortDate(s.date, true))}. `
      + `I authorize Prime Depot Hardware to deduct the full amount from my salary on the <b>${esc(shortDate(s.deductOn, true))}</b> payroll. `
      + 'If my pay for that payroll is not enough, the unpaid part will be deducted on the next payroll. '
      + finalPay;
  }
  const what = s.kind === 'TOPUP'
    ? `an additional <b>${pesoText(s.amount)}</b> on ${esc(shortDate(s.date, true))}, added to my existing loan (new balance ${pesoText(s.newBalance)})`
    : `a ${esc(String(s.purpose || 'loan').toLowerCase())} loan of <b>${pesoText(s.amount)}</b> on ${esc(shortDate(s.date, true))}`;
  const every = s.crew
    ? `every working day, starting ${esc(shortDate(s.date, true))}`
    : `every payroll cutoff, starting with the <b>${esc(shortDate(s.plan?.first, true))}</b> payroll`;
  const short = s.crew
    ? 'On a day I have no pay, nothing is deducted and the loan runs one day longer.'
    : 'If my pay for a payroll is not enough, the unpaid part will be deducted on the next payroll.';
  return `${who} acknowledge that I received ${what} from Prime Depot Hardware. `
    + `I authorize Prime Depot Hardware to deduct <b>${pesoText(s.perRun)}</b> from my salary ${every} until the loan is fully paid. `
    + `${short} ${finalPay}`;
}

function rows(s) {
  const r = [
    ['Employee', `${esc(s.name)}${s.position ? ` · ${esc(s.position)}` : ''}`],
    ['Employee ID', esc(s.employeeId)],
    ['Date given', esc(shortDate(s.date, true))],
  ];
  if (s.kind === 'CASH_ADVANCE') {
    r.push(['Amount', pesoText(s.amount)], ['Deducted in full on', `${esc(shortDate(s.deductOn, true))} payroll`]);
  } else {
    if (s.kind === 'LOAN') r.push(['Purpose', esc(s.purpose)], ['Amount', pesoText(s.amount)]);
    else r.push(['Balance before', pesoText(s.previousBalance)], ['Top-up', pesoText(s.amount)], ['New balance', pesoText(s.newBalance)]);
    r.push(['Deduction', `${pesoText(s.perRun)} per ${s.crew ? 'working day' : 'cutoff'}`]);
    if (s.plan) {
      r.push(['Paid off in', s.crew
        ? `about ${s.plan.count} working day${s.plan.count === 1 ? '' : 's'}`
        : `${s.plan.count} cutoff${s.plan.count === 1 ? '' : 's'} (${esc(shortDate(s.plan.first, true))} to ${esc(shortDate(s.plan.last, true))})`]);
    }
  }
  if (s.ref) r.push(['Reference', esc(s.ref)]);
  return r.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('');
}

// Full HTML page for one slip. Exported so it can be checked without printing.
export function loanSlipHtml(s) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${TITLES[s.kind] || 'ACKNOWLEDGMENT'}</title>
<style>
  @page { size: A5 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1B2430; margin: 0; font-size: 12.5px; line-height: 1.5; }
  .head { text-align: center; border-bottom: 2px solid #C8161D; padding-bottom: 8px; }
  .brand { font-family: Georgia, 'Times New Roman', serif; color: #C8161D; font-size: 19px; font-weight: 700; letter-spacing: .02em; }
  .sub { font-size: 10.5px; letter-spacing: .05em; }
  .addr { font-size: 10px; color: #5B6472; letter-spacing: .08em; }
  h1 { font-size: 13px; letter-spacing: .08em; text-align: center; margin: 14px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  td { padding: 4px 0; border-bottom: 1px solid #ECE7E5; vertical-align: top; }
  td.k { color: #5B6472; width: 38%; }
  td.v { font-weight: 600; }
  p { margin: 0 0 10px; text-align: justify; }
  .sign { display: flex; gap: 28px; margin-top: 34px; }
  .sign div { flex: 1; border-top: 1px solid #1B2430; padding-top: 4px; font-size: 10.5px; text-align: center; }
  .copy { margin-top: 16px; font-size: 9.5px; color: #5B6472; text-align: center; }
</style></head><body>
  <div class="head">
    <div class="brand">PRIME DEPOT HARDWARE</div>
    <div class="sub">TILES, PAINTS &amp; CONSTRUCTION SUPPLY</div>
    <div class="addr">BRGY. P. NIOGAN, MABINI, BATANGAS</div>
  </div>
  <h1>${TITLES[s.kind] || 'ACKNOWLEDGMENT'}</h1>
  <table>${rows(s)}</table>
  <p>${consentText(s)}</p>
  <div class="sign">
    <div>Employee's signature over printed name / Date</div>
    <div>Released by (Operations Head) / Date</div>
  </div>
  <div class="copy">Company copy. The employee may ask for a photocopy.</div>
</body></html>`;
}

// Print the slip without leaving the page. Prints from a hidden same-origin
// iframe, then removes it.
export function printLoanSlip(s) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(loanSlipHtml(s));
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 150);
}
