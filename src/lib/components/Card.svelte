<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    id: string;
    title: string;
    note: string;
    children: Snippet;
  }

  let { id, title, note, children }: Props = $props();
</script>

<article class="card" aria-labelledby={id}>
  <header>
    <h3 {id}>{title}</h3>
    <p class="mono note">{note}</p>
  </header>
  {@render children()}
</article>

<style>
  .card {
    --line: 1.5rem;
    position: relative;
    display: grid;
    align-content: start;
    padding: 0 var(--space-5) calc(var(--line) * 1.5);
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

    /* the hole the drawer's rod goes through */
    &::after {
      content: '';
      position: absolute;
      bottom: 0.5rem;
      left: 50%;
      width: 0.9rem;
      height: 0.9rem;
      translate: -50% 0;
      border-radius: 50%;
      background: var(--ground);
      box-shadow: var(--shadow-hole);
    }
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

  .note {
    font-size: 0.85rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }
</style>
