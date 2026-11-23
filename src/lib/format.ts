const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

export const day = (when: string | number) => longDate.format(new Date(when));

export const number = (value: number) => value.toLocaleString('en-GB');

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${number(count)} ${count === 1 ? one : many}`;

/** "about a minute", "about 4 minutes", rounding up so nobody turns up early */
export function minutes(ms: number) {
  const whole = Math.max(1, Math.ceil(ms / 60_000));
  return whole === 1 ? 'about a minute' : `about ${whole} minutes`;
}
