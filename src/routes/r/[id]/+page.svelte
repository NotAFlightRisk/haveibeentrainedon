<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import Band from '#lib/components/Band.svelte';
  import CallSlip from '#lib/components/CallSlip.svelte';
  import Caveats from '#lib/components/Caveats.svelte';
  import CrawlCard from '#lib/components/CrawlCard.svelte';
  import IndexCard from '#lib/components/IndexCard.svelte';
  import { minutes, plural } from '#lib/format.ts';

  let { data } = $props();

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
  const asked = $derived(result.sets.filter((cell) => cell.verdict !== 'new'));
  const matched = $derived(asked.filter((cell) => cell.verdict === 'match'));
  const waiting = $derived(asked.filter((cell) => cell.verdict === 'pending'));
  const missed = $derived(asked.some((cell) => cell.verdict === 'none'));
  const old = $derived(
    asked.length === result.sets.length ? 'open training sets' : 'sets old enough to hold it'
  );

  const headline = $derived.by(() => {
    if (result.thin) return "This page hasn't got enough sentences of its own to search for";
    if (!asked.length) return 'This page is newer than every training set we can search';
    if (!result.done)
      return `Checking... ${asked.length - waiting.length} of ${asked.length} sets done`;
    if (matched.length === asked.length) {
      return asked.length === 1
        ? `Text from this page is in the one set old enough to hold it`
        : `Text from this page is in all ${asked.length} ${old}`;
    }
    if (matched.length)
      return `Text from this page is in ${matched.length} of the ${asked.length} ${old}`;
    return `No match for these sentences in any of the ${asked.length} ${old}`;
  });

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

  const checkAnyway = $derived(
    result.url ? `/?url=${encodeURIComponent(result.url)}&force` : undefined
  );

  $effect(() => {
    if (result.done) return;
    const soon = result.place?.ahead === 0 ? 5_000 : 20_000;
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
          <CrawlCard crawls={result.crawls} />
        </div>
      </div>
    </section>

    {#if !missed}
      <Caveats />
    {/if}
  {/if}

  <p class="json">
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

  .note {
    max-width: var(--measure);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .json {
    font-size: 0.9rem;
  }
</style>
