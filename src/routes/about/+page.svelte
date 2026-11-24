<script lang="ts">
  import Band from '#lib/components/Band.svelte';
  import { CRAWLS, SETS } from '#lib/corpora.ts';
  import { day } from '#lib/format.ts';
</script>

<svelte:head>
  <title>How it works - Have I Been Trained On?</title>
  <meta
    name="description"
    content="How Have I Been Trained On? picks sentences from a page, counts them in five open AI training sets with infini-gram, and what a match or a miss means."
  />
  <link rel="canonical" href="https://haveibeentrainedon.peng.ly/about" />
</svelte:head>

<Band>
  <h1>How it works</h1>
</Band>

<main>
  <section>
    <h2>Picking the sentences</h2>
    <p>
      It fetches the page once, as <code>HaveIBeenTrainedOn/1.0</code>, with a 10 second limit and a
      2 MB cap. It reads the paragraphs, plus list items inside the article, and skips quotes, code,
      navigation, footers, comments, bios and share boxes, so the sentences are the author's own.
      Pages with no paragraphs at all (Paul Graham's essays, say) fall back to text split at line
      breaks.
    </p>
    <p>
      A sentence counts if it's 70 to 220 characters and at least 12 words, with no brackets, code
      or links. It takes three spread through the page, cuts each to 130 characters at a word, and
      drops the first word, as the indexes miss a phrase that starts a paragraph. It keeps a couple
      of spares, and a second three for a deeper look if you ask for one.
    </p>
  </section>

  <section>
    <h2>Counting them</h2>
    <p>
      <a href="https://infini-gram.io/">infini-gram</a> counts exact matches over each set's full text.
      Every sentence is counted in January 2025's Common Crawl first. More than 200 copies in one month's
      crawl means stock text rather than yours (WordPress's sample page turns up 385,829 times), so it's
      swapped for another sentence, twice at most.
    </p>
    <p>
      Then, for each set, it counts the first two sentences. If they agree, that's the answer. If
      they don't, the third decides. Two out of three is a match, which keeps a quoted line or a bit
      of boilerplate from passing for your writing.
    </p>
    <p>
      A page with a full publish date in its metadata (<code>datePublished</code> or
      <code>article:published_time</code>) is marked too new for any set that stopped before it,
      without asking. A page with no date, or only a year, just gets checked.
    </p>
    <p>
      When a set misses, you can try three more of the page's sentences on it, judged by the same
      two-out-of-three rule. Or check the Wayback Machine's copy of the page from around when that
      set was made, in case you've edited it since.
    </p>
  </section>

  <section>
    <h2>Checking a whole site</h2>
    <p>
      Put in just a domain and it reads the site's sitemaps (the ones its <code>robots.txt</code>
      names, then <code>/sitemap.xml</code>), or its feed if there's no sitemap, and picks 4 posts
      spread across what's listed. Each gets a quick look in Dolma and DCLM, the two sets that kept
      the most small blogs. It's a sample of posts we could find, not a verdict on the site. If it
      picks something that isn't really writing, like a contact page, you can swap it, twice a
      sample.
    </p>
  </section>

  <section>
    <h2>The sets</h2>
    <dl class="sets">
      {#each SETS as set (set.id)}
        <div>
          <dt><a href={set.card}>{set.name}</a></dt>
          <dd>
            Web text to <span class="mono">{set.snapshot}</span>, so nothing published after
            <span class="mono">{day(set.newest)}</span>. {set.models}.
            {#if set.note}{set.note}{/if}
          </dd>
        </div>
      {/each}
      <div>
        <dt><a href={CRAWLS[0].card}>Common Crawl, 2025</a></dt>
        <dd>
          The raw monthly crawls from January to July 2025, via
          <a href="https://infini-gram-mini.io/">infini-gram mini</a>. Each result shows January and
          July. They didn't train any one model, but most web training sets are cut from crawls like
          these, FineWeb included. For the crawls since, it asks
          <a href="https://index.commoncrawl.org/">Common Crawl's own index</a> whether its bot fetched
          the page, which says nothing about training and can't search the text itself.
        </dd>
      </div>
    </dl>
  </section>

  <section>
    <h2>Where it matched</h2>
    <p>
      C4, Dolma and DCLM keep each document's address, so for a match it pulls up to 10 matching
      documents for two of the sentences and groups them by site. That's how you can tell your own
      copy from someone else's. It never says who copied whom, as your page might quote someone too.
      RedPajama only keeps which slice of the crawl a document came from, and the Pile keeps no
      source at all.
    </p>
  </section>

  <section>
    <h2>Limits</h2>
    <p>
      infini-gram is a free research API, so every search waits in one line, one call every 2
      seconds. That's about 100 fresh checks an hour. When the line's more than 10 minutes long, new
      checks get turned away with a time to come back. Each person gets 5 fresh checks an hour, and
      2 site checks a day. Results are kept, so a page someone's already checked loads straight
      away, and it's checked again after 30 days.
    </p>
  </section>

  <section>
    <h2>What gets kept</h2>
    <p>
      The page's address, title and publish date, the sentences it searched and their counts. Pasted
      text isn't kept at all, just fingerprints of its sentences and their counts. A site check
      keeps the list of posts it found, and the crawl check keeps what Common Crawl's index said.
      Your IP address is only used, scrambled, to count your checks for the hour. Result pages have
      addresses nobody can guess, and they aren't listed or indexed anywhere. Each one has a JSON
      copy at <code>/api/result/&lt;id&gt;</code>.
    </p>
  </section>

  <section>
    <h2>Credits</h2>
    <p>
      The counting is all <a href="https://arxiv.org/abs/2401.17377">infini-gram</a> and
      <a href="https://arxiv.org/abs/2506.12229">infini-gram mini</a>, by Jiacheng Liu, Hao Xu and
      their colleagues at the University of Washington and Ai2. This site just asks them nicely.
    </p>
  </section>
</main>

<style>
  h1 {
    font-size: clamp(1.8rem, 4vw, 2.6rem);
  }

  main {
    display: grid;
    gap: var(--space-6);
    max-width: var(--column);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-7);
  }

  section {
    display: grid;
    gap: var(--space-3);
    max-width: var(--measure);
  }

  h2 {
    font-size: 1.35rem;
  }

  code {
    font-size: 0.92em;
  }

  .sets {
    display: grid;
    gap: var(--space-3);
    margin: 0;

    div {
      padding: var(--space-3) var(--space-4);
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
    }

    dt {
      font-weight: 700;
    }

    dd {
      margin: 0;
      color: var(--ink-muted);
    }
  }
</style>
