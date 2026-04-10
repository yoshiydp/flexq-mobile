import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

export async function sendEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) {
  const sender = process.env.SENDER_EMAIL;
  if (!sender) {
    console.warn('SENDER_EMAIL is not set. Skipping email.');
    return;
  }

  await sesClient.send(
    new SendEmailCommand({
      Source: sender,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }),
  );
}
