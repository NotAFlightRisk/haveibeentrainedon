<script lang="ts">
  import { day, number, plural } from '#lib/format.ts';
  import type { Result } from '#lib/server/result.ts';
  import { unwrap } from '#lib/wayback.ts';

  let { result }: { result: Result } = $props();

  const shown = $derived(result.spans.filter((span) => span.text));
  const second = $derived(result.second.filter((span) => span.text));
  const archive = $derived(result.url ? unwrap(result.url) : undefined);
</script>

<section class="slip" aria-labelledby="slip-heading">
  <h2 id="slip-heading">What we searched for</h2>
  <dl>
    {#if result.url}
      <div>
        <dt>Page</dt>
        <dd><a href={result.url} rel="noopener nofollow">{result.title || result.url}</a></dd>
      </div>
    {/if}
    {#if archive}
      <div>
        <dt>Copy from</dt>
        <dd>
          <span class="mono">{day(archive.day)}</span>, kept by the
          <a href="https://web.archive.org/">Wayback Machine</a>
        </dd>
      </div>
    {/if}
    {#if result.published}
      <div>
        <dt>Published</dt>
        <dd class="mono">{day(result.published)}</dd>
      </div>
    {/if}
    <div>
      <dt>Checked</dt>
      <dd class="mono">{day(result.checkedAt)}</dd>
    </div>
  </dl>
  {#if result.kind === 'paste' && !shown.length}
    <p class="fine">
      These came from pasted text, which we don't keep, so only the browser that pasted it can show
      them.
    </p>
  {:else if shown.length}
    <ol>
      {#each shown as span (span.hash)}
        <li>...{span.text}</li>
      {/each}
    </ol>
  {/if}
  {#if second.length}
    <p class="fine">Then these, for the sets those three missed:</p>
    <ol start={shown.length + 1}>
      {#each second as span (span.hash)}
        <li>...{span.text}</li>
      {/each}
    </ol>
  {/if}
  {#if result.stock.length}
    <p class="fine">
      We swapped out {plural(result.stock.length, 'sentence')} that turned up
      {number(Math.max(...result.stock))} times in a single crawl, as that's stock text rather than yours.
    </p>
  {/if}
</section>

<style>
  .slip {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--slip);
    border: 1px solid var(--slip-edge);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
  }

  h2 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--slip-label);
  }

  dl {
    display: grid;
    gap: var(--space-1);
    margin: 0;
  }

  dl > div {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: var(--space-3);
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--slip-edge);
  }

  dt {
    color: var(--slip-label);
    font-size: 0.85rem;
    font-weight: 600;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  ol {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding-left: var(--space-5);
    font-family: var(--font-mono);
    font-size: 0.95rem;
    line-height: 1.5;

    li::marker {
      color: var(--slip-label);
      font-weight: 700;
    }
  }

  .fine {
    font-size: 0.85rem;
    color: var(--slip-label);
  }

  @media (width < 32rem) {
    dl > div {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
