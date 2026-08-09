import nodemailer from "nodemailer";

/**
 * Sends via SMTP if configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in .env).
 * Falls back to a log line so export generation never fails just because email
 * isn't wired up yet.
 */
export async function emailSender(to: string | undefined, subject: string, body: string): Promise<boolean> {
  if (!process.env.SMTP_HOST || !to) {
    console.log(`[email] SMTP not configured or no recipient — skipping. Subject: "${subject}"`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "tcm@example.com",
    to,
    subject,
    text: body,
  });

  return true;
}
