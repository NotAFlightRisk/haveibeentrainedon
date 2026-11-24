<script lang="ts">
  import { enhance } from '$app/forms';
  import { day } from '#lib/format.ts';
  import type { Capture, CaptureState } from '#lib/server/captures.ts';

  const MONTH = 30 * 24 * 60 * 60_000;

  let { captures, error }: { captures: Capture[]; error?: string } = $props();

  const words: Record<CaptureState, string> = {
    found: 'fetched',
    missing: 'not fetched',
    waiting: 'asking',
    failed: "couldn't ask"
  };

  const short = (name: string) => `${name.slice(0, 3)} ${name.slice(-4)}`;
  const found = $derived(captures.filter((capture) => capture.state === 'found'));
  const asking = $derived(captures.some((capture) => capture.state === 'waiting'));
  const latest = $derived(found.at(-1));
  const answered = $derived(
    captures.filter(({ state }) => state === 'found' || state === 'missing')
  );
  const read = $derived(found.findLast((capture) => capture.held !== null));
  // Common Crawl puts out a crawl most months, so a month-old answer is worth asking again
  const stale = $derived(
    !asking && Date.now() - Math.max(...captures.map((capture) => capture.asked)) > MONTH
  );
  const failed = $derived(!asking && captures.some(({ state }) => state === 'failed'));
  const label = $derived(
    !captures.length
      ? 'Ask about the crawls since'
      : failed
        ? 'Ask again about the ones it missed'
        : 'Ask about any newer crawls'
  );
  let sending = $state(false);
</script>

<section class="captures" aria-labelledby="captures-heading">
  <h3 id="captures-heading">Common Crawl since July 2025</h3>
  {#if captures.length}
    <p>
      {#if asking}
        Asking Common Crawl's own index about each crawl since, one at a time.
      {:else if latest?.day}
        Its bot took a copy in {found.length} of the {answered.length} crawls we asked about, most recently
        on <span class="mono">{day(latest.day)}</span>.
      {:else if answered.length}
        Its bot didn't take a copy in any of the {answered.length} crawls we asked about.
      {:else}
        Common Crawl's index didn't answer, so this one's a blank for now.
      {/if}
      That's Common Crawl fetching the page, not anybody training on it.
    </p>
    {#if read?.day && read.sentences}
      <p>
        We read its copy from <span class="mono">{day(read.day)}</span>, and it holds
        {read.held === read.sentences
          ? `all ${read.sentences} of the sentences we searched for`
          : `${read.held || 'none'} of the ${read.sentences} sentences we searched for, so the page may have changed`}.
      </p>
    {/if}
    <ol>
      {#each captures as capture (capture.id)}
        <li class={capture.state}>
          <span class="date mono">{short(capture.name)}</span>
          <span class="said">{words[capture.state]}</span>
        </li>
      {/each}
    </ol>
  {/if}
  {#if !captures.length || stale || failed}
    <form
      method="POST"
      action="?/crawls"
      use:enhance={() => {
        sending = true;
        return async ({ update }) => {
          await update({ reset: false });
          sending = false;
        };
      }}
    >
      {#if !captures.length}
        <p>
          The searchable text stops at July 2025, but Common Crawl's own index can say which of its
          crawls since then fetched the page. Fetched isn't trained on, but it's where the next sets
          will come from.
        </p>
      {/if}
      <button disabled={sending}>
        {sending ? 'Asking...' : label}
      </button>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
    </form>
  {/if}
</section>

<style>
  .captures {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  h3 {
    padding-bottom: var(--space-2);
    border-bottom: 2px solid var(--card-top);
    font-size: 1.2rem;
  }

  p {
    max-width: var(--measure);
    color: var(--ink-muted);
  }

  ol {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    margin: 0;
    padding: var(--space-2) 0;
    list-style: none;
  }

  li {
    display: grid;
    justify-items: center;
    padding: 0 var(--space-2);
    border: 1px solid currentColor;
    border-radius: var(--radius-control);
    color: var(--stamp-pending);
    line-height: 1.35;

    &.found {
      border-width: 2px;
      color: var(--stamp-date);
      filter: url(#ink-faint);
      transform: rotate(-3deg);
    }

    &.missing,
    &.failed {
      border-style: dashed;
      color: var(--stamp-none);
    }
  }

  .date {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .said {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  form {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }

  button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--ink);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;

    &:hover {
      background: var(--surface-sunk);
    }

    &:disabled {
      cursor: progress;
      color: var(--ink-faint);
    }
  }

  .error {
    color: var(--stamp-match);
    font-weight: 600;
  }
</style>
