<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import InkFilter from '#lib/components/InkFilter.svelte';
  import { SITE } from '#lib/share.ts';

  let { children } = $props();
</script>

<svelte:head>
  <meta property="og:image" content="https://{SITE}{page.data.ogImage ?? '/og.png'}" />
</svelte:head>

<InkFilter />
<div class="site" class:wide={page.route.id === '/r/[id]' || page.route.id === '/d/[id]'}>
  {@render children()}

  <footer>
    <nav aria-label="Site">
      <a href="/">Check a page</a>
      <a href="/about">How it works</a>
      <a href="https://github.com/NotAFlightRisk/haveibeentrainedon">Source code</a>
    </nav>
    <p>
      Counts come from <a href="https://infini-gram.io/">infini-gram</a>, run by the University of
      Washington and Ai2. Made by <a href="https://peng.ly">peng.ly</a>.
    </p>
  </footer>
</div>

<style>
  .site {
    --column: 46rem;

    &.wide {
      --column: var(--page);
    }
  }

  footer {
    display: grid;
    gap: var(--space-2);
    max-width: var(--column);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-7);
    border-top: 1px solid var(--rule);
    color: var(--ink-muted);
    font-size: 0.9rem;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    font-weight: 600;
    color: var(--ink);
  }
</style>
