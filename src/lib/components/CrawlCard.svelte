<script lang="ts">
  import type { Cell, CellVerdict } from '#lib/server/result.ts';
  import Card from './Card.svelte';

  let { crawls, between }: { crawls: Cell[]; between?: string } = $props();

  const words: Record<CellVerdict, string> = {
    match: 'found',
    none: 'not found',
    new: 'too new',
    pending: 'checking',
    failed: "couldn't check"
  };

  const short = (snapshot: string) => `${snapshot.slice(0, 3)} ${snapshot.slice(-4)}`;
</script>

<Card id="crawls" title="Common Crawl" note="2025">
  <ol>
    {#each crawls as crawl (crawl.id)}
      <li class={crawl.verdict}>
        <span class="date mono">{short(crawl.snapshot)}</span>
        <span class="said">{words[crawl.verdict]}</span>
      </li>
    {/each}
  </ol>
  <p>
    The raw monthly crawls that most web training sets are cut from, FineWeb included, so they show
    roughly when your text was taken.
  </p>
  <p>A miss can't tell you whether blocking Common Crawl's bot worked.</p>
  {#if between}
    <p><a href={between}>Check the months between</a></p>
  {/if}
</Card>

<style>
  ol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    min-height: calc(var(--line) * 3);
    margin: 0;
    padding: var(--space-2) 0;
    list-style: none;
  }

  li {
    display: grid;
    justify-items: center;
    padding: var(--space-1) var(--space-3);
    border: 2px solid currentColor;
    border-radius: var(--radius-control);
    color: var(--stamp-pending);
    background: var(--surface);
    line-height: 1.35;

    &.match {
      color: var(--stamp-date);
      filter: url(#ink-faint);
      transform: rotate(-3deg);
    }

    &.none,
    &.failed {
      border-style: dashed;
      color: var(--stamp-none);
    }

    &.new {
      border-style: dotted;
      color: var(--stamp-none);
    }
  }

  .date {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .said {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  p {
    font-size: 0.92rem;
    color: var(--ink-muted);

    a {
      color: var(--ink);
      font-weight: 600;
    }
  }
</style>
