<script lang="ts">
  import Band from '#lib/components/Band.svelte';
  import Caveats from '#lib/components/Caveats.svelte';
  import Card from '#lib/components/Card.svelte';
  import CheckForm from '#lib/components/CheckForm.svelte';
  import PasteForm from '#lib/components/PasteForm.svelte';
  import { SETS } from '#lib/corpora.ts';

  let { data, form } = $props();

  const fetchFailed = $derived(!!form && 'paste' in form && form.paste === true);
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
    error={fetchFailed ? `${form?.error} You can paste its text below instead.` : form?.error}
  />
  <details class="paste" open={fetchFailed || !!form?.pasteError}>
    <summary>Can't link to it? Paste the text instead</summary>
    <PasteForm sitekey={data.sitekey} error={form?.pasteError} />
  </details>
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
    <div class="drawer">
      {#each SETS as set (set.id)}
        <Card id="set-{set.id}" title={set.name} note="to {set.snapshot}">
          <p class="models">{set.models}.</p>
        </Card>
      {/each}
      <Card id="set-crawls" title="Common Crawl" note="2025">
        <p class="models">
          January and July's raw crawls. They trained no one model, but most web training sets are
          cut from crawls like these, FineWeb included.
        </p>
      </Card>
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

  .paste {
    display: grid;
    gap: var(--space-3);
    width: 100%;

    summary {
      font-weight: 600;
      color: var(--shell-ink);
    }
  }

  main {
    display: grid;
    gap: var(--space-7);
    max-width: var(--column);
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

  .drawer {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
    gap: var(--space-5);
  }

  .models {
    font-size: 0.92rem;
    color: var(--ink-muted);
  }
</style>
