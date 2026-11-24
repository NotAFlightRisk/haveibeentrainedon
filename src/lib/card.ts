import { day } from '#lib/format.ts';
import type { Cell, CellVerdict, Result } from '#lib/server/result.ts';
import { headlineFor, SITE, STAMPS } from '#lib/share.ts';
import { unwrap } from '#lib/wayback.ts';

const WIDTH = 1200;
const HEIGHT = 630;
const EDGE = 56;
const LINE = 30;
const CARD = { top: 362, height: 228, gap: 22 };

interface Look {
  colour: string;
  size: number;
  quiet?: boolean;
  dashed?: boolean;
}

// Stamp.svelte's stamps, scaled up to the picture
const LOOKS: Record<CellVerdict, Look> = {
  match: { colour: 'stamp-match', size: 30 },
  new: { colour: 'stamp-date', size: 23 },
  none: { colour: 'stamp-none', size: 20, quiet: true },
  failed: { colour: 'stamp-none', size: 18, dashed: true },
  pending: { colour: 'stamp-pending', size: 18, dashed: true }
};

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

const font = (weight: number, size: number, family = 'sans') =>
  `${weight} ${size}px ${token(`font-${family}`)}`;

/** The page's host minus its www (the original's for an archived copy), if it has one */
export const hostOf = (url: string | null) =>
  url && new URL(unwrap(url)?.original ?? url).hostname.replace(/^www\./, '');

/** Lines that fit the width, the last cut short with an ellipsis if there's more */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, most = Infinity) {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest && lines.length < most) {
    let end = rest.length;
    while (ctx.measureText(rest.slice(0, end)).width > width) {
      const space = rest.lastIndexOf(' ', end - 1);
      end = space > 0 ? space : end - 1;
    }
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (!rest) return lines;
  let last = lines.pop()!;
  while (ctx.measureText(`${last}…`).width > width) {
    const space = last.lastIndexOf(' ');
    last = space > 0 ? last.slice(0, space) : last.slice(0, -1);
  }
  return [...lines, `${last.replace(/[\s\p{P}]+$/u, '')}…`];
}

/** Like text-wrap: balance, narrowing the measure while that takes no more lines or split words */
function balance(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const count = wrap(ctx, text, width).length;
  const widest = Math.max(...text.split(' ').map((word) => ctx.measureText(word).width));
  while (width - 10 >= widest && wrap(ctx, text, width - 10).length === count) width -= 10;
  return wrap(ctx, text, width);
}

/** Writes the lines down from y, handing back where the next line would go */
function write(ctx: CanvasRenderingContext2D, lines: string[], y: number, step: number) {
  for (const line of lines) {
    ctx.fillText(line, EDGE, y);
    y += step;
  }
  return y;
}

function stamp(ctx: CanvasRenderingContext2D, verdict: CellVerdict, x: number, y: number) {
  const { colour, size, quiet, dashed } = LOOKS[verdict];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(((quiet ? -2 : -5) * Math.PI) / 180);
  ctx.fillStyle = ctx.strokeStyle = token(colour);
  ctx.filter = quiet || dashed ? 'url(#ink-faint)' : 'url(#ink)';
  ctx.font = font(quiet ? 700 : 800, size);
  ctx.letterSpacing = `${size * (quiet ? 0.03 : 0.14)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = balance(ctx, quiet ? STAMPS[verdict] : STAMPS[verdict].toUpperCase(), 150);
  const step = size * 1.25;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 34;
  const height = lines.length * step + 18;
  const edge = (inset: number) => {
    const [across, down] = [width / 2 - inset, height / 2 - inset];
    ctx.beginPath();
    ctx.roundRect(-across, -down, across * 2, down * 2, 8 - inset);
    ctx.stroke();
  };
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([6, 4]);
  edge(1);
  if (!quiet && !dashed) edge(4);
  lines.forEach((line, row) => ctx.fillText(line, 0, (row - (lines.length - 1) / 2) * step));
  ctx.restore();
}

function card(ctx: CanvasRenderingContext2D, cell: Cell, x: number, width: number) {
  const { top, height } = CARD;
  // canvas shadows can't spread, so the shadow comes off a shape shrunk by the spread instead
  const [, drop, blur, spread, ...colour] = token('shadow-box').split(' ');
  const inset = -parseFloat(spread);
  ctx.save();
  ctx.shadowColor = colour.join(' ');
  ctx.shadowOffsetY = parseFloat(drop);
  ctx.shadowBlur = parseFloat(blur);
  ctx.fillRect(x + inset, top + inset, width - inset * 2, height - inset * 2);
  ctx.restore();

  ctx.fillStyle = token('surface');
  ctx.beginPath();
  ctx.roundRect(x, top, width, height, 4);
  ctx.fill();
  ctx.fillStyle = token('card-line');
  for (let y = top + LINE * 3 - 1; y < top + height; y += LINE) ctx.fillRect(x, y, width, 1);
  ctx.fillStyle = token('card-top');
  ctx.fillRect(x, top + LINE * 2 - 3, width, 3);
  ctx.fillStyle = token('ink');
  ctx.font = font(700, 28);
  ctx.fillText(cell.name, x + 18, top + LINE * 2 - 12);
  ctx.fillStyle = token('ink-muted');
  ctx.font = font(400, 16, 'mono');
  ctx.fillText(`to ${cell.snapshot}`, x + 18, top + LINE * 3 - 9);
  // the hole the drawer's rod goes through
  ctx.fillStyle = token('shell');
  ctx.beginPath();
  ctx.arc(x + width / 2, top + height - 20, 8, 0, 2 * Math.PI);
  ctx.fill();
  stamp(ctx, cell.verdict, x + width / 2, top + (LINE * 3 + height - 40) / 2);
}

/** The green band: the site, then the page, when it was checked and what turned up */
function band(ctx: CanvasRenderingContext2D, title: string, checked: string, headline: string) {
  ctx.fillStyle = token('shell');
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = token('shell-raised');
  ctx.fillRect(EDGE, 84, WIDTH - EDGE * 2, 2);
  ctx.fillStyle = token('shell-ink');
  ctx.font = font(700, 28);
  ctx.fillText('Have I Been Trained On?', EDGE, 60);
  ctx.fillStyle = token('shell-muted');
  ctx.font = font(700, 22, 'mono');
  ctx.textAlign = 'right';
  ctx.fillText(SITE, WIDTH - EDGE, 60);
  ctx.textAlign = 'left';

  ctx.fillStyle = token('shell-ink');
  ctx.font = font(700, 34);
  let y = write(ctx, wrap(ctx, title, WIDTH - EDGE * 2, 2), 138, 42);
  ctx.fillStyle = token('shell-muted');
  ctx.font = font(400, 20, 'mono');
  y = write(ctx, [checked], y - 6, 64);
  ctx.fillStyle = token('shell-ink');
  ctx.font = font(800, 44);
  ctx.letterSpacing = `${44 * -0.015}px`;
  write(ctx, balance(ctx, headline, WIDTH - EDGE * 2), y, 48);
  ctx.letterSpacing = '0px';
}

/** The result as a 1200x630 picture to keep, in the page's own fonts and colours */
export async function drawCard(result: Result) {
  const title = result.title || result.url || "Pasted text, so there's no title";
  const checked = [hostOf(result.url), `Checked ${day(result.checkedAt)}`];
  const headline = headlineFor(result);
  const faces = [font(700, 34), font(800, 44), font(400, 20, 'mono'), font(700, 20, 'mono')];
  await Promise.all(faces.map((face) => document.fonts.load(face, title + headline)));

  const canvas = Object.assign(document.createElement('canvas'), { width: WIDTH, height: HEIGHT });
  const ctx = canvas.getContext('2d')!;
  band(ctx, title, checked.filter(Boolean).join(' · '), headline);
  const { sets } = result;
  const width = (WIDTH - EDGE * 2 - CARD.gap * (sets.length - 1)) / sets.length;
  sets.forEach((cell, order) => card(ctx, cell, EDGE + order * (width + CARD.gap), width));
  return new Promise<Blob>((done) => canvas.toBlob((blob) => done(blob!)));
}
