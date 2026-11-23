<script lang="ts">
  import { day, plural } from '#lib/format.ts';
  import type { Where } from '#lib/server/result.ts';

  let { where }: { where: Where } = $props();
</script>

<div class="where">
  {#if where.kind === 'unrecorded'}
    <p>Your words are in there, but the Pile doesn't record which site each bit came from.</p>
  {:else if !where.ready}
    <p class="waiting">Looking up where it matched...</p>
  {:else if where.kind === 'slice'}
    <p>From its {where.parts.join(', ')} {where.parts.length === 1 ? 'slice' : 'slices'}.</p>
  {:else}
    {#if where.own === 'both' && where.mine}
      <p class="own">
        Your own site's copy: <strong>{where.mine.host}</strong>{#if where.mine.date}, crawled <span
            class="mono"
          >
            {day(where.mine.date)}
          </span>{/if}.
      </p>
    {:else if where.own === 'one'}
      <p class="own">Your site turns up for one of the two sentences.</p>
    {:else}
      <p class="own">Your site isn't among the copies we looked at for either sentence.</p>
    {/if}
    {#if where.others.length}
      <details>
        <summary>
          {plural(where.others.length, 'other site')}
          {where.others.length === 1 ? 'has' : 'have'} this text
        </summary>
        <ul>
          {#each where.others as copy (copy.host)}
            <li>
              <span class="host">{copy.host}</span>
              {#if copy.both}<span class="pill">both sentences</span>{/if}
              {#if copy.date}<span class="mono date">{day(copy.date)}</span>{/if}
            </li>
          {/each}
        </ul>
        <p class="fine">
          Up to 10 copies a sentence, picked by the index. It can't say who copied whom.
        </p>
      </details>
    {/if}
  {/if}
</div>

<style>
  .where {
    margin-top: var(--line);
    font-size: 0.9rem;
    color: var(--ink-muted);
  }

  .waiting {
    font-style: italic;
  }

  .own strong {
    color: var(--ink);
    font-weight: 650;
  }

  summary {
    cursor: pointer;
    color: var(--ink);
    font-weight: 550;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
  }

  .host {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .pill {
    padding: 0 var(--space-2);
    border: 1px solid var(--rule-strong);
    border-radius: 999px;
    font-size: 0.75rem;
    line-height: 1.2;
  }

  .date,
  .fine {
    font-size: 0.8rem;
  }
</style>
