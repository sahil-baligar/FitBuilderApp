import { env } from '../config/env.js';
import { log } from '../util/log.js';

/**
 * Outbound email for verification and password reset.
 *
 * Railway provides no mail service, so this is a thin seam over whichever
 * provider is configured. With none set the API logs the message instead of
 * sending it, which keeps local development working and makes the missing
 * configuration obvious rather than silently dropping mail.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export const emailConfigured = (): boolean => Boolean(env.resendApiKey);

const sendViaResend = async (message: OutboundEmail): Promise<void> => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Email provider rejected the message (${res.status}): ${await res.text()}`);
  }
};

/**
 * Never throws. A failed send must not fail the surrounding request: signup
 * should still create the account, and a password-reset request must return
 * the same response whether or not the address exists.
 */
export const sendEmail = async (message: OutboundEmail): Promise<void> => {
  try {
    if (!emailConfigured()) {
      log.loud(
        `EMAIL NOT CONFIGURED — message to ${message.to} was not sent.\n` +
          `Subject: ${message.subject}\n${message.text}`,
      );
      return;
    }
    await sendViaResend(message);
    log.info(`email sent to ${message.to}: ${message.subject}`);
  } catch (err) {
    log.error(`failed to send email to ${message.to}`, err);
  }
};

const appLink = (path: string, token: string) => `${env.appUrl}/${path}?token=${encodeURIComponent(token)}`;

export const sendVerificationEmail = (to: string, token: string) =>
  sendEmail({
    to,
    subject: 'Confirm your FitBuilder email',
    text: [
      'Welcome to FitBuilder.',
      '',
      'Confirm this address to secure your account and enable password resets:',
      appLink('verify-email', token),
      '',
      'The link expires in 24 hours. If you did not create a FitBuilder account, ignore this message.',
    ].join('\n'),
  });

export const sendPasswordResetEmail = (to: string, token: string) =>
  sendEmail({
    to,
    subject: 'Reset your FitBuilder password',
    text: [
      'We received a request to reset your FitBuilder password.',
      '',
      'Choose a new password here:',
      appLink('reset-password', token),
      '',
      'The link expires in 1 hour and can be used once.',
      'If you did not request this, ignore this message — your password has not changed.',
    ].join('\n'),
  });
