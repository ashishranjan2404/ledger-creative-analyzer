export const RECIPIENT = 'ashishranjan2404@gmail.com' as const;

export function assertPersonalRecipient(
  addr: string,
): asserts addr is typeof RECIPIENT {
  if (addr !== RECIPIENT) {
    throw new Error(
      'personal tool only — recipient must be ashishranjan2404@gmail.com',
    );
  }
}
