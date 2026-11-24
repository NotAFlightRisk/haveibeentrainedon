import { Parser } from 'htmlparser2';
import { PRIMARY, pickSpans, sentences } from '#lib/spans.ts';

export interface Page {
  title: string;
  published?: string;
  canonical?: string;
  lang?: string;
  spans: string[];
}

interface Block {
  text: string;
  scoped: boolean;
}

interface Open {
  skip: boolean;
  scope: boolean;
  block?: Block;
}

const SKIP = new Set(
  'blockquote nav footer header pre aside form figure dialog script style noscript template svg button select textarea'.split(
    ' '
  )
);
const CODE = new Set(['code', 'kbd', 'samp']);
const BLOCKS = new Set(
  'p div td th li tr table section article main h1 h2 h3 h4 h5 h6 dd dt ul ol'.split(' ')
);
// the bits of a page that aren't the author's own words
const NOT_OURS =
  /(^|[\s_-])(comments?|authors?|bio|share|sharing|sharedaddy|related|relatedposts|newsletter|subscribe|byline|cookies?|consent|gdpr|sidebar|promo|popup|modal|banner|sponsor|sponsored|adverts?|advertisement)(?=$|[\s_-])/i;
const NOT_PROSE = new Set([
  'navigation',
  'complementary',
  'contentinfo',
  'banner',
  'dialog',
  'alertdialog'
]);

/** A real calendar date at the start of the value, or nothing */
function fullDate(value: string | undefined) {
  const day = value?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  return new Date(`${day}T00:00:00Z`).toISOString().startsWith(day) ? day : undefined;
}

const isSkipped = (name: string, attribs: Record<string, string>) =>
  SKIP.has(name) ||
  'hidden' in attribs ||
  attribs['aria-hidden'] === 'true' ||
  NOT_PROSE.has(attribs.role) ||
  NOT_OURS.test(`${attribs.class ?? ''} ${attribs.id ?? ''}`);

const INVISIBLE = new Set(['script', 'style', 'noscript', 'template']);

/** Everything a page shows, in one line, for checking a stored copy word for word */
export function pageText(html: string) {
  let text = '';
  let hidden = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (INVISIBLE.has(name)) hidden++;
        if (BLOCKS.has(name) || name === 'br') text += ' ';
      },
      ontext(chunk) {
        if (!hidden) text += chunk;
      },
      onclosetag(name) {
        if (INVISIBLE.has(name)) hidden--;
        if (BLOCKS.has(name)) text += ' ';
      }
    },
    { decodeEntities: true, lowerCaseTags: true }
  );
  parser.end(html);
  return text.replace(/\s+/g, ' ');
}

/** Reads a page once, keeping the prose its author wrote and the few facts we need about it */
export function readPage(html: string): Page {
  const stack: Open[] = [];
  const blocks: Block[] = [];
  const scoped: string[] = [];
  const paragraphs: string[] = [];
  const loose: string[] = [];
  const meta: Omit<Page, 'spans'> & { ogTitle?: string } = { title: '' };
  let skipping = 0;
  let scopes = 0;
  let inTitle = false;
  let ld: string | undefined;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const skip = isSkipped(name, attribs);
        const scope = name === 'article' || name === 'main';
        const startsBlock = name === 'p' || (name === 'li' && scopes > 0);
        const open: Open = { skip, scope };
        if (!skipping && !skip && startsBlock) {
          open.block = { text: '', scoped: scopes > 0 };
          blocks.push(open.block);
        }
        if (name === 'html') meta.lang = attribs.lang;
        if (name === 'title' && !skipping && !meta.title) inTitle = true;
        if (name === 'script' && attribs.type === 'application/ld+json') ld = '';
        if (name === 'meta') readMeta(attribs);
        if (name === 'link' && attribs.rel?.split(/\s+/).includes('canonical')) {
          meta.canonical ??= attribs.href;
        }
        if (!skipping && CODE.has(name)) appendText('`');
        if (BLOCKS.has(name)) loose.push('\n\n');
        if (name === 'br') appendText('\n');
        stack.push(open);
        if (skip) skipping++;
        if (scope) scopes++;
      },
      ontext(text) {
        if (inTitle) meta.title += text;
        if (ld !== undefined) ld += text;
        if (!skipping) appendText(text);
      },
      onclosetag(name) {
        const open = stack.pop();
        if (!open) return;
        if (open.skip) skipping--;
        if (open.scope) scopes--;
        if (name === 'title') inTitle = false;
        if (name === 'script' && ld !== undefined) {
          meta.published ??= fullDate(ld.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]);
          ld = undefined;
        }
        if (open.block) {
          blocks.pop();
          (open.block.scoped ? scoped : paragraphs).push(open.block.text);
        }
        if (BLOCKS.has(name)) loose.push('\n\n');
      }
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );

  function appendText(text: string) {
    const block = blocks.at(-1);
    if (block) block.text += text;
    loose.push(text);
  }

  function readMeta(attribs: Record<string, string>) {
    const key = attribs.property ?? attribs.name;
    const content = attribs.content?.trim();
    if (!content) return;
    if (key === 'article:published_time') meta.published ??= fullDate(content);
    if (key === 'og:title') meta.ogTitle ??= content;
  }

  parser.end(html);

  const choices = [scoped, [...scoped, ...paragraphs], loose.join('').split(/\n\s*\n/)];
  const prose = choices.find((choice) => sentences(choice).length >= PRIMARY) ?? choices[2];
  const title = (meta.ogTitle ?? meta.title).replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    title,
    published: meta.published,
    canonical: meta.canonical,
    lang: meta.lang?.toLowerCase(),
    spans: pickSpans(prose)
  };
}
