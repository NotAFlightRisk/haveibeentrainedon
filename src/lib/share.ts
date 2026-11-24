import type { Cell, CellVerdict, Result } from '#lib/server/result.ts';

type Verdicts = Pick<Cell, 'verdict'>[];
type Outcome = Pick<Result, 'thin' | 'done'> & { sets: Verdicts };

export const SITE = 'haveibeentrainedon.peng.ly';

/** The unfurl image for a site's sample, the same whatever it found */
export const OG_DOMAIN = '/og/domain.png';

/** What each stamp says */
export const STAMPS: Record<CellVerdict, string> = {
  match: 'Match',
  none: 'No match for these sentences',
  new: 'Too new',
  pending: 'Checking',
  failed: "Couldn't check"
};

/** A stamp's words where the sentences aren't beside it, in a table or a picture */
export const SHORT: Record<CellVerdict, string> = { ...STAMPS, none: 'No match' };

/** The letter each settled verdict gets in a share image's name, one per set in SETS order */
export const LETTERS: Partial<Record<CellVerdict, string>> = { match: 'm', none: 'n', new: 't' };

/** The result page's one-line verdict */
export function headlineFor({ thin, done, sets }: Outcome) {
  const asked = sets.filter(({ verdict }) => verdict !== 'new' && verdict !== 'failed');
  const matched = asked.filter(({ verdict }) => verdict === 'match').length;
  const waiting = asked.filter(({ verdict }) => verdict === 'pending').length;
  const failed = sets.some(({ verdict }) => verdict === 'failed');
  const kind = sets.some(({ verdict }) => verdict === 'new')
    ? 'sets old enough to hold it'
    : 'open training sets';
  const old = failed ? `${kind} we could check` : kind;
  if (thin) return "This page hasn't got enough sentences of its own to search for";
  if (!asked.length) {
    return failed
      ? "The corpus host wouldn't answer for this page, so try it again later"
      : 'This page is newer than every training set we can search';
  }
  if (!done) return `Checking... ${asked.length - waiting} of ${asked.length} sets done`;
  if (asked.length === 1) {
    return matched
      ? `Text from this page is in the one ${old.replace('sets', 'set')}`
      : `No match for these sentences in the one ${old.replace('sets', 'set')}`;
  }
  if (matched === asked.length) return `Text from this page is in all ${asked.length} ${old}`;
  if (matched) return `Text from this page is in ${matched} of the ${asked.length} ${old}`;
  return `No match for these sentences in any of the ${asked.length} ${old}`;
}

/** The unfurl image for a result's sets, or the site's own until every one has settled */
export function ogImage(sets: Verdicts) {
  const letters = sets.map(({ verdict }) => LETTERS[verdict]);
  return letters.every(Boolean) ? `/og/r/${letters.join('')}.png` : '/og.png';
}
