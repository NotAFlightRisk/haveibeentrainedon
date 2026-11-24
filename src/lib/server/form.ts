import { minutes } from '#lib/format.ts';
import type { Refusal } from './lookup.ts';

export const NOT_A_PERSON = "The person check hadn't finished. Give it a second and try again.";

/** Why a fresh check was turned away, and when to come back */
export function refusal({ reason, retryAt }: Refusal, domain = false) {
  const wait = minutes(retryAt - Date.now());
  if (reason === 'busy') {
    return `The line's full, as the corpus host only takes so many searches an hour. Try again in ${wait}.`;
  }
  return domain
    ? `That's your 2 site checks for today. Try again in ${wait}, or check one post at a time.`
    : `That's your 5 fresh checks for this hour. Try again in ${wait}, or look up a page someone's already checked.`;
}
