<script lang="ts">
  import type { Cell } from '#lib/server/result.ts';
  import Card from './Card.svelte';
  import Matches from './Matches.svelte';
  import Stamp from './Stamp.svelte';

  let { cell, order = 0 }: { cell: Cell; order?: number } = $props();

  const counted = $derived(cell.counts.filter((count) => count !== null));
</script>

<Card id="set-{cell.id}" title={cell.name} note="to {cell.snapshot}">
  <div class="mark">
    <Stamp verdict={cell.verdict} delay={order * 90} />
  </div>
  <p class="models">{cell.models}.</p>
  {#if cell.note && cell.verdict === 'none'}
    <p class="models">{cell.note}</p>
  {/if}
  {#if counted.length}
    <p class="tally">
      <span>Copies per sentence</span>
      <span class="mono">{counted.map((count) => (count < 0 ? '?' : count)).join(' · ')}</span>
    </p>
  {/if}
  {#if cell.where}
    <Matches where={cell.where} />
  {/if}
</Card>

<style>
  .mark {
    display: flex;
    align-items: center;
    height: calc(var(--line) * 2);
  }

  .models {
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
      white-space: nowrap;
    }
  }
</style>
