<script lang="ts">
  import type { Cell } from '#lib/server/result.ts';
  import Matches from './Matches.svelte';
  import Stamp from './Stamp.svelte';

  let { cell, order = 0 }: { cell: Cell; order?: number } = $props();

  const tally = $derived(
    cell.counts.map((count) => (count === null ? 'n/a' : count < 0 ? '?' : String(count)))
  );
</script>

<article class="card" aria-labelledby="set-{cell.id}">
  <header>
    <h3 id="set-{cell.id}">{cell.name}</h3>
    <p class="mono snapshot">to {cell.snapshot}</p>
  </header>
  <div class="mark">
    <Stamp verdict={cell.verdict} delay={order * 90} />
  </div>
  <p class="models">{cell.models}.</p>
  {#if cell.note && cell.verdict === 'none'}
    <p class="note">{cell.note}</p>
  {/if}
  {#if tally.some((count) => count !== 'n/a')}
    <p class="tally">
      <span>Copies of each sentence</span>
      <span class="mono">{tally.join(' · ')}</span>
    </p>
  {/if}
  {#if cell.where}
    <Matches where={cell.where} />
  {/if}
</article>

<style>
  .card {
    --line: 1.5rem;
    display: grid;
    align-content: start;
    padding: 0 var(--space-5) var(--line);
    line-height: var(--line);
    background:
      linear-gradient(var(--card-top), var(--card-top)) 0 calc(var(--line) * 2 - 2px) / 100% 2px
        no-repeat,
      repeating-linear-gradient(
          to bottom,
          transparent 0 calc(var(--line) - 1px),
          var(--card-line) calc(var(--line) - 1px) var(--line)
        )
        0 calc(var(--line) * 2) / 100% 100% no-repeat,
      var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
  }

  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
    height: calc(var(--line) * 2);
    padding-bottom: 0.3rem;
  }

  h3 {
    font-size: 1.2rem;
    font-weight: 700;
    line-height: var(--line);
  }

  .snapshot {
    font-size: 0.85rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }

  .mark {
    display: flex;
    align-items: center;
    height: calc(var(--line) * 2);
  }

  .models,
  .note {
    font-size: 0.92rem;
    color: var(--ink-muted);
  }

  .tally {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 0.85rem;
    color: var(--ink-faint);

    .mono {
      color: var(--ink);
    }
  }
</style>
