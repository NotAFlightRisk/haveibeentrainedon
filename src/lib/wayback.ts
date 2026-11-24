const SNAPSHOT = /^https?:\/\/web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})\d*(?:id_)?\/(.+)$/;

/** The page a Wayback Machine copy is of, and the day it was taken */
export function unwrap(url: string) {
  const [, year, month, date, original] = SNAPSHOT.exec(url) ?? [];
  return original ? { original, day: `${year}-${month}-${date}` } : undefined;
}

/** The Wayback Machine's copy of a page nearest a day, as it was served, without the toolbar */
export const snapshot = (url: string, day: string) =>
  `https://web.archive.org/web/${day.replaceAll('-', '')}id_/${url}`;
