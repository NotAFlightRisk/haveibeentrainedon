<script lang="ts">
  import type { Cell, CellVerdict } from '#lib/server/result.ts';

  let { crawls }: { crawls: Cell[] } = $props();

  const words: Record<CellVerdict, string> = {
    match: 'found',
    none: 'not found',
    new: 'too new',
    pending: 'checking',
    failed: "couldn't check"
  };
</script>

<section class="timeline" aria-labelledby="crawls-heading">
  <h2 id="crawls-heading">Common Crawl, 2025</h2>
  <p class="lede">
    The raw monthly crawls most web training sets are cut from, FineWeb included. They show roughly
    when your text was taken, not which model learnt from it.
  </p>
  <ol>
    {#each crawls as crawl (crawl.id)}
      <li class={crawl.verdict}>
        <span class="date mono">{crawl.snapshot.toUpperCase()}</span>
        <span class="said">{words[crawl.verdict]}</span>
      </li>
    {/each}
  </ol>
  <p class="fine">
    A miss here can't tell you whether blocking Common Crawl's bot worked. Pages go missing from a
    crawl for plenty of other reasons.
  </p>
</section>

<style>
  .timeline {
    display: grid;
    gap: var(--space-3);
  }

  h2 {
    font-size: 1.25rem;
  }

  .lede,
  .fine {
    max-width: var(--measure);
    color: var(--ink-muted);
  }

  .fine {
    font-size: 0.9rem;
  }

  ol {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: var(--space-2) 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    min-width: 8.5rem;
    padding: var(--space-3) var(--space-4);
    border: 2px solid currentColor;
    border-radius: var(--radius-control);
    color: var(--stamp-pending);
    background: var(--surface);

    &.match {
      color: var(--stamp-date);
      filter: url(#ink);
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
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .said {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
</style>
