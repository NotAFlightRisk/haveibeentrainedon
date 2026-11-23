<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, home = false }: { children: Snippet; home?: boolean } = $props();
</script>

<header class="band" class:home>
  <div class="inner">
    {#if !home}
      <a class="name" href="/">Have I Been Trained On?</a>
    {/if}
    {@render children()}
  </div>
</header>

<style>
  .band {
    background: var(--shell);
    color: var(--shell-ink);
  }

  .inner {
    display: grid;
    gap: var(--space-4);
    max-width: var(--page);
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-6);
  }

  .home .inner {
    max-width: 46rem;
    padding-block: var(--space-8) var(--space-7);
    justify-items: start;
  }

  .name {
    justify-self: start;
    font-weight: 700;
    color: var(--shell-muted);
    text-decoration: none;

    &:hover {
      color: var(--shell-ink);
    }
  }

  .band :global(a:not(.name)) {
    color: var(--shell-ink);
  }
</style>
