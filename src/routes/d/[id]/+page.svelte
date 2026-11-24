<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Band from '#lib/components/Band.svelte';
  import Caveats from '#lib/components/Caveats.svelte';
  import Stamp from '#lib/components/Stamp.svelte';
  import { SETS } from '#lib/corpora.ts';
  import { day, minutes, plural } from '#lib/format.ts';
  import { turnstile } from '#lib/turnstile.ts';

  let { data, form } = $props();

  const sample = $derived(data.sample);
  const columns = $derived(
    SETS.filter((set) => sample.posts.some((post) => post.cells.some((cell) => cell.id === set.id)))
  );
  const matched = (id: string) =>
    sample.posts.filter((post) =>
      post.cells.some((cell) => cell.id === id && cell.verdict === 'match')
    ).length;
  const found = $derived(columns.map((set) => ({ name: set.name, count: matched(set.id) })));
  const these = $derived(
    sample.posts.length === 1 ? 'this post' : `these ${sample.posts.length} posts`
  );

  const headline = $derived.by(() => {
    if (!sample.done)
      return `Checking ${plural(sample.posts.length, 'post')} from ${sample.host}...`;
    if (found.every(({ count }) => !count)) {
      return `No match for ${these}' sentences in ${found.map(({ name }) => name).join(' or ')}`;
    }
    const [first, ...rest] = found;
    const others = rest.map(({ name, count }) => `${count} in ${name}`).join(', ');
    return `Text from ${first.count} of ${these} is in ${first.name}${others ? `, and from ${others}` : ''}`;
  });

  const progress = $derived.by(() => {
    const place = sample.place;
    if (sample.done || !place) return '';
    if (place.paused) {
      return 'The corpus host has asked us to slow down, so the line is paused for a couple of minutes.';
    }
    return `It'll be done in ${minutes(place.wait)}. Leave this page open and it fills itself in.`;
  });

  let sending = $state(false);
  let tries = $state(0);

  $effect(() => {
    if (sample.done) return;
    const timer = setTimeout(() => invalidateAll(), 20_000);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head>
  <title>{sample.host} - Have I Been Trained On?</title>
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
  <section class="sample" aria-labelledby="sample-heading">
    <div class="intro">
      <h2 id="sample-heading">
        A sample of {plural(sample.posts.length, 'post')} we could find on {sample.host}
      </h2>
      <p>
        We picked them from across the site's sitemap or feed and gave each a quick look in the two
        sets that kept the most small blogs. It's a sample, not a verdict on the whole site. Run the
        full check on any post for all five sets and where the copies are.
      </p>
    </div>

    <form
      method="POST"
      action="?/swap"
      use:enhance={() => {
        sending = true;
        return async ({ update }) => {
          await update({ reset: false });
          sending = false;
          tries++;
        };
      }}
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Post</th>
            {#each columns as set (set.id)}
              <th scope="col" class="set">{set.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sample.posts as post, row (post.listed)}
            <tr>
              <th scope="row">
                <div class="post">
                  <a class="title" href={post.url} rel="noopener nofollow">
                    {post.title || post.url}
                  </a>
                  {#if post.published}
                    <span class="mono date">{day(post.published)}</span>
                  {/if}
                  <span class="actions">
                    <a href="/?url={encodeURIComponent(post.url)}">Full check</a>
                    {#if sample.swapsLeft > 0}
                      <button name="post" value={post.listed} disabled={sending}>Swap it</button>
                    {/if}
                  </span>
                </div>
              </th>
              {#each columns as set, column (set.id)}
                {@const cell = post.cells.find((candidate) => candidate.id === set.id)}
                <td>
                  {#if post.thin}
                    <span class="thin">Too few sentences</span>
                  {:else if cell}
                    <Stamp
                      verdict={cell.verdict}
                      short
                      delay={(row * columns.length + column) * 90}
                    />
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      {#if sample.swapsLeft > 0}
        <div class="swap">
          <p>
            Picked a post that isn't really writing, like a contact page? You can swap {plural(
              sample.swapsLeft,
              'more post'
            )}.
          </p>
          {#if data.sitekey}
            <div use:turnstile={{ sitekey: data.sitekey, tries }}></div>
          {/if}
        </div>
      {/if}
      {#if form?.error}
        <p class="error" role="alert">{form.error}</p>
      {/if}
    </form>
  </section>

  <Caveats />

  <p class="json">
    <a href="/api/result/{sample.id}">This sample as JSON</a>
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

  .sample {
    display: grid;
    gap: var(--space-4);
  }

  .intro {
    display: grid;
    gap: var(--space-2);

    h2 {
      font-size: 1.25rem;
    }

    p {
      max-width: var(--measure);
      color: var(--ink-muted);
    }
  }

  form {
    display: grid;
    gap: var(--space-4);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  thead th {
    padding: var(--space-3) var(--space-4);
    border-bottom: 2px solid var(--card-top);
    font-size: 0.85rem;
    font-weight: 700;
    text-align: start;
    color: var(--ink-muted);
  }

  tbody tr + tr {
    border-top: 1px solid var(--card-line);
  }

  tbody th,
  td {
    padding: var(--space-4);
    vertical-align: middle;
  }

  tbody th {
    font-weight: 400;
    text-align: start;
  }

  .post {
    display: grid;
    gap: var(--space-1);
  }

  .set,
  td {
    width: 9rem;
  }

  .title {
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  .date {
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
    font-size: 0.9rem;
    font-weight: 600;

    button {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.2em;
      cursor: pointer;

      &:hover {
        text-decoration-thickness: 2px;
      }

      &:disabled {
        cursor: progress;
        color: var(--ink-faint);
      }
    }
  }

  .thin {
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  .swap {
    display: grid;
    gap: var(--space-3);
    justify-items: start;

    p {
      max-width: var(--measure);
      font-size: 0.92rem;
      color: var(--ink-muted);
    }
  }

  .error {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--stamp-match);
    font-weight: 600;
  }

  .json {
    font-size: 0.9rem;
  }

  @media (width < 40rem) {
    tbody th,
    td,
    thead th {
      padding: var(--space-3) var(--space-2);
    }

    .set,
    td {
      width: auto;
    }
  }
</style>
