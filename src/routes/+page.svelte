<script lang="ts">
  import Band from '#lib/components/Band.svelte';
  import Caveats from '#lib/components/Caveats.svelte';
  import CheckForm from '#lib/components/CheckForm.svelte';
  import { SETS, TIMELINE } from '#lib/corpora.ts';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Have I Been Trained On? Search AI training data for your writing</title>
  <meta
    name="description"
    content="Paste the address of something you wrote and see if its sentences are in C4, the Pile, RedPajama, Dolma, DCLM or 2025's Common Crawls."
  />
  <meta property="og:title" content="Have I Been Trained On?" />
  <meta
    property="og:description"
    content="Search the open AI training sets for your own sentences, not a guess from a crawl index."
  />
  <link rel="canonical" href="https://haveibeentrainedon.peng.ly/" />
</svelte:head>

<Band home>
  <h1>Have I Been Trained On?</h1>
  <p class="lede">
    Paste the address of something you wrote, and it'll look for your own sentences in the text that
    open AI models were trained on.
  </p>
  <CheckForm
    sitekey={data.sitekey}
    value={form?.url ?? data.prefill}
    force={data.force}
    error={form?.error}
  />
  <p class="fine">
    A fresh check takes about 40 seconds. Three sentences from the page go to
    <a href="https://infini-gram.io/">infini-gram</a>'s search at the University of Washington.
  </p>
</Band>

<main>
  <section aria-labelledby="sets-heading">
    <h2 id="sets-heading">What it searches</h2>
    <p>
      The full text of five open training sets, plus two of 2025's raw Common Crawls. Every one is a
      snapshot, so a page written after it can't be in it.
    </p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Set</th>
            <th scope="col">Web text up to</th>
            <th scope="col">What it trained</th>
          </tr>
        </thead>
        <tbody>
          {#each [...SETS, ...TIMELINE] as corpus (corpus.id)}
            <tr>
              <th scope="row"><a href={corpus.card}>{corpus.name}</a></th>
              <td class="mono">{corpus.snapshot}</td>
              <td>{corpus.models}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="how-heading">
    <h2 id="how-heading">How it works</h2>
    <p>
      It reads the page once and picks three long sentences of your own from different parts of it,
      skipping quotes, comments and bios. Then it counts each one in each set with infini-gram, an
      exact-match search over the sets' full text.
    </p>
    <p>
      If two of the three turn up, that set's a match. A sentence that turns up hundreds of times in
      one month's crawl is stock text, so it's swapped for another. For C4, Dolma and DCLM it also
      lists where the copies came from, so you can see whether it's your site or someone else's. <a
        href="/about"
      >
        More on the method
      </a>.
    </p>
  </section>

  <Caveats />
</main>

<style>
  h1 {
    font-size: clamp(2.3rem, 6vw, 3.6rem);
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .lede {
    max-width: 38rem;
    font-size: 1.2rem;
    color: var(--shell-muted);
  }

  .fine {
    font-size: 0.9rem;
    color: var(--shell-muted);
  }

  main {
    display: grid;
    gap: var(--space-7);
    max-width: 46rem;
    margin: 0 auto;
    padding: var(--space-7) var(--space-4);
  }

  section {
    display: grid;
    gap: var(--space-3);

    > p {
      max-width: var(--measure);
    }
  }

  h2 {
    font-size: 1.5rem;
  }

  .scroll {
    overflow-x: auto;
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    font-size: 0.95rem;
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--card-line);
    text-align: left;
    vertical-align: top;
  }

  thead th {
    border-bottom: 2px solid var(--card-top);
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  tbody th {
    font-weight: 650;
    white-space: nowrap;
  }

  td.mono {
    white-space: nowrap;
  }
</style>
