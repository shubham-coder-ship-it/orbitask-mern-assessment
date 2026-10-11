import nodemailer from 'nodemailer';

// SMTP settings come from environment variables. Nothing is hardcoded.
let transport = null;
let override = null;

export function emailConfigured() {
  return Boolean(override || (process.env.SMTP_HOST && process.env.SMTP_FROM));
}

// Tests inject a fake transport; production never calls this.
export function setTransportForTests(t) {
  override = t;
  transport = null;
}

function getTransport() {
  if (override) return override;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim(); // strips header-injection characters

// Sends ONE message to ONE recipient (so recipients never see each other's addresses).
// The From address is always the configured one; the user's own address may only be Reply-To.
export async function sendMail({ to, subject, text, replyTo }) {
  if (!emailConfigured()) {
    const err = new Error('Email delivery is not configured on the server');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const info = await getTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: clean(to),
    subject: clean(subject),
    text,
    ...(replyTo ? { replyTo: clean(replyTo) } : {}),
  });
  return { providerMessageId: info?.messageId || null };
}
