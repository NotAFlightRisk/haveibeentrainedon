import { env } from 'cloudflare:workers';

/** Cloudflare's check that a person sent the form. Without a secret set, as in dev, it waves you in */
export async function isHuman(token: FormDataEntryValue | null, ip: string) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  body.append('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10_000)
  });
  const { success } = (await response.json()) as { success: boolean };
  return success;
}
