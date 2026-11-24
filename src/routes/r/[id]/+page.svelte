<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import Band from '#lib/components/Band.svelte';
  import CallSlip from '#lib/components/CallSlip.svelte';
  import Captures from '#lib/components/Captures.svelte';
  import DownloadCard from '#lib/components/DownloadCard.svelte';
  import Caveats from '#lib/components/Caveats.svelte';
  import CrawlCard from '#lib/components/CrawlCard.svelte';
  import IndexCard from '#lib/components/IndexCard.svelte';
  import { minutes, plural } from '#lib/format.ts';
  import { headlineFor } from '#lib/share.ts';
  import { snapshot, unwrap } from '#lib/wayback.ts';

  let { data, form } = $props();

  let mounted = $state(false);
  onMount(() => (mounted = true));

  // pasted text never reaches our storage, so its sentences come from this browser's own copy
  const remembered = (hash: string) => {
    try {
      return sessionStorage.getItem(`span:${hash}`) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const result = $derived(
    mounted && data.result.kind === 'paste'
      ? {
          ...data.result,
          spans: data.result.spans.map((span) => ({ ...span, text: remembered(span.hash) }))
        }
      : data.result
  );
  const missed = $derived(result.sets.some((cell) => cell.verdict === 'none'));

  const headline = $derived(headlineFor(result));

  const progress = $derived.by(() => {
    const place = result.place;
    if (result.done || !place) return '';
    if (place.paused)
      return 'The corpus host has asked us to slow down, so the line is paused for a couple of minutes.';
    const wait = minutes(place.wait);
    if (!place.ahead)
      return `It's your turn. This page fills in as each set is counted, ${wait} in all.`;
    return `${plural(place.ahead, 'check')} ahead of you, so ${wait}. Leave this page open and it fills itself in.`;
  });

  const again = (extra: string) =>
    result.url ? `/?url=${encodeURIComponent(result.url)}&${extra}` : undefined;
  const checkAnyway = $derived(again('force'));
  const between = $derived(
    result.done &&
      result.crawls.length === 2 &&
      result.crawls.some((crawl) => crawl.verdict !== 'new')
      ? again('between')
      : undefined
  );
  const deeper = $derived(result.done && missed && result.more ? again('deeper') : undefined);
  // the oldest copy is the page as it first went up, before any edits since
  const archived = $derived(
    result.done && missed && result.url && !unwrap(result.url)
      ? `/?url=${encodeURIComponent(snapshot(result.url, '1996-01-01'))}`
      : undefined
  );

  const asking = $derived(result.captures.some((capture) => capture.state === 'waiting'));

  $effect(() => {
    if (result.done && !asking) return;
    const soon = result.place?.ahead === 0 || asking ? 5_000 : 20_000;
    const timer = setTimeout(() => invalidateAll(), soon);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head>
  <title>{result.title ? `${result.title} - ` : ''}Have I Been Trained On?</title>
  <meta name="robots" content="noindex" />
  <meta property="og:title" content={headline} />
</svelte:head>

<Band>
  <div class="verdict" aria-live="polite">
    <h1>{headline}</h1>
    {#if progress}
      <p>{progress}</p>
    {/if}
  </div>
</Band>

<main>
  <div class="lead" class:split={missed && !result.thin && result.url}>
    <CallSlip {result} />
    {#if missed && !result.thin}
      <Caveats />
    {/if}
  </div>

  {#if result.thin}
    <p class="note">
      It needs at least two long sentences that aren't quotes, comments or stock text, and this page
      didn't have them. Pages that are mostly pictures, lists or code tend to end up here.
    </p>
  {:else}
    {#if !result.english}
      <p class="note">
        This page doesn't look like it's in English. C4 is English only and the rest mostly are, so
        a miss means even less than usual.
      </p>
    {/if}

    <section aria-labelledby="sets-heading" class="sets">
      <h2 id="sets-heading">Training sets and crawls</h2>
      <div class="drawer">
        {#each result.sets as cell, order (cell.id)}
          <div class="slot">
            <IndexCard {cell} {order} />
            {#if cell.verdict === 'new' && checkAnyway}
              <a class="anyway" href={checkAnyway}>Check anyway</a>
            {/if}
          </div>
        {/each}
        <div class="slot">
          <CrawlCard crawls={result.crawls} {between} />
        </div>
      </div>
      {#if result.url && (result.done || result.captures.length)}
        <Captures captures={result.captures} error={form?.crawlError} />
      {/if}
      {#if deeper || archived}
        <p class="more">
          A miss can just mean these sentences were edited since, or quoted from somewhere.
          {#if deeper}
            <a href={deeper}>Try three more of the page's sentences</a> on the sets that missed.
          {/if}
          {#if archived}
            Or check <a href={archived}>the Wayback Machine's oldest copy</a> of the page.
          {/if}
        </p>
      {/if}
    </section>

    {#if !missed}
      <Caveats />
    {/if}
  {/if}

  <p class="json">
    {#if result.done && !result.thin}
      <DownloadCard {result} />
    {/if}
    <a href="/api/result/{result.id}">This result as JSON</a>
  </p>
</main>

<style>
  .verdict {
    display: grid;
    gap: var(--space-2);

    h1 {
      max-width: 40ch;
      font-size: clamp(1.6rem, 4vw, 2.4rem);
      font-weight: 800;
    }

    p {
      max-width: var(--measure);
      color: var(--shell-muted);
    }
  }

  main {
    display: grid;
    gap: var(--space-6);
    max-width: var(--column);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-7);
  }

  .lead {
    display: grid;
    gap: var(--space-5);

    @media (width >= 64rem) {
      &.split {
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      }
    }
  }

  .sets {
    display: grid;
    gap: var(--space-4);

    h2 {
      font-size: 1.25rem;
    }
  }

  .drawer {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
    gap: var(--space-5);
  }

  .slot {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: var(--space-2);
  }

  .anyway {
    justify-self: start;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .more {
    max-width: var(--measure);
    color: var(--ink-muted);

    a {
      color: var(--ink);
      font-weight: 600;
    }
  }

  .note {
    max-width: var(--measure);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .json {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-5);
    font-size: 0.9rem;
  }
</style>
