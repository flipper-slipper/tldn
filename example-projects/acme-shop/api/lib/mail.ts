import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_KEY ?? '')

export async function sendEmail(to: string, subject: string, text: string) {
  await sgMail.send({ to, from: 'no-reply@acme.shop', subject, text })
}
