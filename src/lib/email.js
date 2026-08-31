import nodemailer from 'nodemailer';

// Email sending, kept behind one helper so the rest of the app never touches
// the transport. Credentials come from the environment — a Gmail address and an
// App Password (NOT the account password), set as EMAIL_USER and
// EMAIL_APP_PASSWORD in .env.local. If either is missing the app still runs;
// the caller simply learns email is not configured and handles it gracefully.
let cached = null;

function getTransporter() {
  if (cached) return cached;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  cached = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return cached;
}

export function isEmailConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);
}

/// Send the Operations Head a one-time password-reset code.
///
/// Throws if email is not configured or the send fails, so the route can log it
/// server-side — but the route still answers the user generically, so a failure
/// never reveals whether an address was on file.
export async function sendPasswordResetCode(to, code) {
  const t = getTransporter();
  if (!t) throw new Error('Email is not configured (set EMAIL_USER and EMAIL_APP_PASSWORD).');

  await t.sendMail({
    from: `"Prime Depot Payroll" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your Prime Depot password reset code',
    text:
      `Your Prime Depot password reset code is: ${code}\n\n`
      + `Enter it on the reset screen to choose a new password. `
      + `The code expires in 10 minutes.\n\n`
      + `If you did not request this, you can ignore this email — your password stays unchanged.`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;color:#1B2430">`
      + `<div style="background:#C8161D;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">`
      + `Prime Depot Payroll</div>`
      + `<div style="border:1px solid #DED9D7;border-top:none;border-radius:0 0 8px 8px;padding:20px">`
      + `<p style="margin:0 0 12px">Use this code to reset your password:</p>`
      + `<div style="font-size:30px;font-weight:800;letter-spacing:6px;text-align:center;`
      + `background:#F4F5F7;border-radius:8px;padding:14px 0;margin:0 0 14px">${code}</div>`
      + `<p style="margin:0 0 8px;color:#6B7280;font-size:13px">The code expires in 10 minutes.</p>`
      + `<p style="margin:0;color:#6B7280;font-size:13px">If you did not request this, ignore this email — `
      + `your password stays unchanged.</p>`
      + `</div></div>`,
  });
}
