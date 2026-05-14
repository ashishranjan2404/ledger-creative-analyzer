import { fetchJson } from './_http.ts';
import { assertPersonalRecipient } from './_recipient.ts';

export type SendArgs = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  endpoint?: string;
};

export type SendResult = { id: string };

const DEFAULT_ENDPOINT = 'https://api.resend.com/emails';

// Shared sender address (DKIM-verified for platformy.org). Loop 14: lifted out of
// each routine's per-file const so a future domain swap is one-place.
export const FROM_ADDRESS = 'thedi@platformy.org';

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  assertPersonalRecipient(args.to);
  const endpoint = args.endpoint ?? DEFAULT_ENDPOINT;
  const body = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    text: args.text,
  };
  const data = await fetchJson<SendResult>(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { id: data.id };
}
