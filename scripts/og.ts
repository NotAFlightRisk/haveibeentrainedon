// Draws the unfurl images: one per way a result's sets can settle, and one for a site's sample
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';
import { QUICK, SETS, type Corpus } from '#lib/corpora.ts';
import type { CellVerdict } from '#lib/server/result.ts';
import { headlineFor, LETTERS, OG_DOMAIN, ogImage, SITE, STAMPS } from '#lib/share.ts';

type Child = Node | string | false | undefined;
interface Node {
  type: string;
  props: Record<string, unknown>;
}

const WIDTH = 1200;
const HEIGHT = 630;
const EDGE = 56;
const LINE = 30;

const project = (path: string) => new URL(`../${path}`, import.meta.url);

const css = readFileSync(project('src/app.css'), 'utf8');
const tokens = new Map(
  [...css.match(/:root\s*{([^}]*)}/)![1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(
    ([, name, value]) => [name, value]
  )
);

function token(name: string) {
  const value = tokens.get(name);
  if (!value) throw new Error(`src/app.css has no --${name}`);
  return value;
}

const div = (style: object, ...children: Child[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: children.filter(Boolean) }
});

const page = {
  position: 'relative',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  fontFamily: token('font-sans')
};

// a see-through page, for drawing one layer on its own
const sheet = (...children: Child[]) => div(page, ...children);

// the green band with the site's name along the top
const band = (...children: Child[]) =>
  div(
    {
      ...page,
      flexDirection: 'column',
      padding: `0 ${EDGE}px`,
      background: token('shell'),
      color: token('shell-ink')
    },
    div(
      {
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '30px 0 20px',
        borderBottom: `2px solid ${token('shell-raised')}`
      },
      div({ fontSize: 28, fontWeight: 700 }, 'Have I Been Trained On?'),
      div(
        {
          fontFamily: token('font-mono'),
          fontSize: 22,
          fontWeight: 700,
          color: token('shell-muted')
        },
        SITE
      )
    ),
    ...children
  );

const headline = (text: string) =>
  div(
    {
      position: 'absolute',
      top: 118,
      left: EDGE,
      right: EDGE,
      color: token('shell-ink'),
      fontSize: 56,
      fontWeight: 800,
      lineHeight: 1.1,
      letterSpacing: '-0.015em',
      textWrap: 'balance'
    },
    text
  );

// the cards along the bottom, laid out the same whether it's the cards or just their stamps
const drawer = (...slots: Node[]) =>
  div(
    { position: 'absolute', left: EDGE, right: EDGE, bottom: 48, height: 290, gap: 22 },
    ...slots
  );

const top = token('card-top');
const lines = `transparent 0 ${LINE - 1}px, ${token('card-line')} ${LINE - 1}px ${LINE}px`;
const ruled = [
  `linear-gradient(${top}, ${top}) 0 ${LINE * 2 - 3}px / 100% 3px no-repeat`,
  `repeating-linear-gradient(${lines}) 0 ${LINE * 2}px no-repeat`,
  token('surface')
].join(', ');

// the hole the drawer's rod goes through
const hole = div(
  { position: 'absolute', left: 0, right: 0, bottom: 12, justifyContent: 'center' },
  div({
    width: 16,
    height: 16,
    borderRadius: 8,
    background: token('shell'),
    boxShadow: token('shadow-hole')
  })
);

const card = (corpus: Corpus, ...body: Child[]) =>
  div(
    {
      position: 'relative',
      flex: 1,
      flexDirection: 'column',
      padding: '0 18px',
      borderRadius: 4,
      background: ruled,
      boxShadow: token('shadow-box'),
      color: token('ink'),
      lineHeight: `${LINE}px`
    },
    div(
      { height: LINE * 2, alignItems: 'flex-end', paddingBottom: 6, fontSize: 28, fontWeight: 700 },
      corpus.name
    ),
    div(
      { fontFamily: token('font-mono'), fontSize: 16, color: token('ink-muted') },
      `to ${corpus.snapshot}`
    ),
    ...body,
    hole
  );

// where a card's stamp lands, under its snapshot line and clear of the hole
const slot = (...children: Child[]) =>
  div(
    {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: `${LINE * 3}px 18px 40px`
    },
    ...children
  );

const looks: Partial<Record<CellVerdict, object>> = {
  match: { color: token('stamp-match'), fontSize: 30 },
  new: { color: token('stamp-date'), fontSize: 23 },
  none: {
    color: token('stamp-none'),
    border: '2px solid',
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: '0.03em',
    textTransform: 'none',
    textAlign: 'center',
    textWrap: 'balance',
    whiteSpace: 'normal',
    transform: 'rotate(-2deg)'
  }
};

const stamp = (verdict: CellVerdict) =>
  div(
    {
      padding: '4px 12px',
      border: '5px double',
      borderRadius: 8,
      fontWeight: 800,
      letterSpacing: '0.14em',
      lineHeight: 1.25,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      transform: 'rotate(-5deg)',
      ...looks[verdict]
    },
    STAMPS[verdict]
  );

function domainImage() {
  const sampled = QUICK.filter((corpus) => SETS.includes(corpus));
  const names = new Intl.ListFormat('en-GB').format(sampled.map(({ name }) => name));
  return band(
    headline(`A sample of posts from one site, searched in ${names}`),
    drawer(
      ...sampled.map((corpus) =>
        card(
          corpus,
          div({ fontSize: 22, color: token('ink-muted'), textWrap: 'balance' }, `${corpus.models}.`)
        )
      )
    )
  );
}

const face = (name: string, weight: 400 | 700 | 800) => {
  const slug = name.toLowerCase().replace(' ', '-');
  const file = `node_modules/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff`;
  return { name, weight, style: 'normal' as const, data: readFileSync(project(file)) };
};

const fonts = [
  face('Libre Franklin', 400),
  face('Libre Franklin', 700),
  face('Libre Franklin', 800),
  face('Courier Prime', 400),
  face('Courier Prime', 700)
];

async function draw(node: Node) {
  const svg = await satori(node as never, { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg);
  const image = resvg.render();
  const { pixels } = image;
  image.free();
  resvg.free();
  return pixels;
}

const layers = new Map<string, Uint8Array>();

async function layer(key: string, node: () => Node) {
  if (!layers.has(key)) layers.set(key, await draw(sheet(node())));
  return layers.get(key)!;
}

// resvg's pixels come premultiplied, so a layer goes over what's below with a plain sum
function over(below: Uint8Array, ink: Uint8Array) {
  for (let at = 0; at < ink.length; at += 4) {
    const showing = 255 - ink[at + 3];
    if (showing === 255) continue;
    for (let channel = at; channel < at + 3; channel++) {
      below[channel] = ink[channel] + (below[channel] * showing) / 255;
    }
  }
  return below;
}

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

// resvg's own PNGs come out nearly twice the size, so it's plain RGB rows squeezed hard
function png(pixels: Uint8Array) {
  const rows = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let from = 0, to = 0; from < pixels.length; from += 4) {
    if (from % (WIDTH * 4) === 0) to++;
    rows[to++] = pixels[from];
    rows[to++] = pixels[from + 1];
    rows[to++] = pixels[from + 2];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 2], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const settled = Object.keys(LETTERS) as CellVerdict[];
const patterns = SETS.reduce<CellVerdict[][]>(
  (all) => all.flatMap((pattern) => settled.map((verdict) => [...pattern, verdict])),
  [[]]
);
const results = patterns.map((verdicts) => ({
  verdicts,
  path: ogImage(verdicts.map((verdict) => ({ verdict })))
}));
const missing = [...results.map(({ path }) => path), OG_DOMAIN].filter(
  (path) => !existsSync(project(`static${path}`))
);

if (missing.length) {
  const started = performance.now();
  await initWasm(readFileSync(project('node_modules/@resvg/resvg-wasm/index_bg.wasm')));
  mkdirSync(project('static/og/r'), { recursive: true });
  const save = (path: string, pixels: Uint8Array) =>
    writeFileSync(project(`static${path}`), png(pixels));

  if (missing.includes(OG_DOMAIN)) save(OG_DOMAIN, await draw(domainImage()));

  // shadows are slow to draw, so it's one lot of empty cards with each headline and stamp laid on
  const paper = await draw(band(drawer(...SETS.map((corpus) => card(corpus)))));
  for (const { verdicts, path } of results.filter(({ path }) => missing.includes(path))) {
    const sets = verdicts.map((verdict) => ({ verdict }));
    const text = headlineFor({ thin: false, done: true, sets });
    const inks = [await layer(text, () => headline(text))];
    for (const [order, verdict] of verdicts.entries()) {
      const stamped = () => drawer(...SETS.map((_, at) => slot(at === order && stamp(verdict))));
      inks.push(await layer(`${verdict} ${order}`, stamped));
    }
    save(path, inks.reduce(over, paper.slice()));
  }

  const took = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Drew ${missing.length} share images in ${took}s`);
}
