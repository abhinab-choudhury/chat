import nodemailer from 'nodemailer'
import { render } from '@react-email/render'

import { OtpEmail } from '#/emails/otp-email'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === 'true',
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
})

export async function sendOtpEmail({
  email,
  otp,
  type,
}: {
  email: string
  otp: string
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
}) {
  const html = await render(<OtpEmail otp={otp} type={type} />)

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? 'no-reply@localhost',
    to: email,
    subject: 'Your one-time code',
    html,
  })
}