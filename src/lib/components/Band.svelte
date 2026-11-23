<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, home = false }: { children: Snippet; home?: boolean } = $props();
</script>

<header class="band" class:home>
  {#if !home}
    <div class="top">
      <a class="name" href="/">Have I Been Trained On?</a>
      <a href="/about">How it works</a>
    </div>
  {/if}
  <div class="inner">
    {@render children()}
  </div>
</header>

<style>
  .band {
    background: var(--shell);
    color: var(--shell-ink);

    :global(a) {
      color: var(--shell-ink);
    }
  }

  .top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    max-width: var(--column);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--shell-raised);
    font-size: 0.92rem;

    a {
      color: var(--shell-muted);
      text-decoration: none;

      &:hover {
        color: var(--shell-ink);
      }
    }

    .name {
      font-weight: 700;
      color: var(--shell-ink);
    }
  }

  .inner {
    display: grid;
    justify-items: start;
    gap: var(--space-4);
    max-width: var(--column);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }

  .home .inner {
    padding-block: var(--space-8) var(--space-7);
  }
</style>
