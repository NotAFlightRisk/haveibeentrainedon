import { Parser } from 'htmlparser2';
import { PRIMARY, pickSpans, sentences } from '#lib/spans.ts';

export interface Page {
  title: string;
  published?: string;
  canonical?: string;
  lang?: string;
  spans: string[];
}

interface Open {
  skip: boolean;
  scope: boolean;
  block?: { text: string; scoped: boolean };
}

const SKIP = new Set(
  'blockquote nav footer header pre aside form figure script style noscript template svg button select textarea'.split(
    ' '
  )
);
const CODE = new Set(['code', 'kbd', 'samp']);
const BLOCKS = new Set(
  'p div td th li tr table section article main h1 h2 h3 h4 h5 h6 dd dt ul ol'.split(' ')
);
// the bits of a page that aren't the author's own words
const NOT_OURS =
  /(^|[\s_-])(comment|author|bio|share|sharing|related|newsletter|subscribe|byline)/i;
const FULL_DATE = /^\d{4}-\d{2}-\d{2}/;

const NOT_PROSE = new Set(['navigation', 'complementary', 'contentinfo', 'banner']);

const isSkipped = (name: string, attribs: Record<string, string>) =>
  SKIP.has(name) ||
  'hidden' in attribs ||
  attribs['aria-hidden'] === 'true' ||
  NOT_PROSE.has(attribs.role) ||
  NOT_OURS.test(`${attribs.class ?? ''} ${attribs.id ?? ''}`);

/** Reads a page once, keeping the prose its author wrote and the few facts we need about it */
export function readPage(html: string): Page {
  const stack: Open[] = [];
  const scoped: string[] = [];
  const paragraphs: string[] = [];
  const meta: Omit<Page, 'spans'> & { ogTitle?: string } = { title: '' };
  let skipping = 0;
  let scopes = 0;
  let loose = '';
  let inTitle = false;
  let ld: string | undefined;

  const current = () => stack.findLast((open) => open.block)?.block;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const skip = isSkipped(name, attribs);
        const scope = name === 'article' || name === 'main';
        const startsBlock = name === 'p' || (name === 'li' && scopes > 0);
        const open: Open = { skip, scope };
        if (!skipping && !skip && startsBlock) open.block = { text: '', scoped: scopes > 0 };
        if (name === 'html') meta.lang = attribs.lang;
        if (name === 'title' && !skipping && !meta.title) inTitle = true;
        if (name === 'script' && attribs.type === 'application/ld+json') ld = '';
        if (name === 'meta') readMeta(attribs);
        if (name === 'link' && attribs.rel?.split(/\s+/).includes('canonical')) {
          meta.canonical ??= attribs.href;
        }
        if (!skipping && CODE.has(name)) appendText('`');
        if (BLOCKS.has(name)) loose += '\n\n';
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
          meta.published ??= ld.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1];
          ld = undefined;
        }
        if (open.block) (open.block.scoped ? scoped : paragraphs).push(open.block.text);
        if (BLOCKS.has(name)) loose += '\n\n';
      }
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );

  function appendText(text: string) {
    const block = current();
    if (block) block.text += text;
    loose += text;
  }

  function readMeta(attribs: Record<string, string>) {
    const key = attribs.property ?? attribs.name;
    const content = attribs.content?.trim();
    if (!content) return;
    if (key === 'article:published_time' && FULL_DATE.test(content)) {
      meta.published ??= content.slice(0, 10);
    }
    if (key === 'og:title') meta.ogTitle ??= content;
  }

  parser.end(html);

  const choices = [scoped, [...scoped, ...paragraphs], loose.split(/\n\s*\n/)];
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
