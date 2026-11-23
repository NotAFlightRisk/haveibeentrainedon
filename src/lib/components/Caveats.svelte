<section class="caveats" aria-labelledby="caveats-heading">
  <h2 id="caveats-heading">What this can't tell you</h2>
  <ul>
    <li>
      A miss is weak evidence. Your page might never have been crawled, or been filtered out, or
      changed since. On 60 small blogs' posts from 2015 to 2022, Dolma found 70% and DCLM only 23%.
    </li>
    <li>
      A match means the text is in the set, not that it came from your page. Someone may have quoted
      or copied you, or you them.
    </li>
    <li>
      Closed labs (OpenAI, Google, Anthropic and co) don't publish their training data, so nobody
      can search it. FineWeb, the biggest open one, has no public full-text search either.
    </li>
    <li>The searchable sets stop at July 2025, so anything newer can't be in them.</li>
  </ul>
</section>

<style>
  .caveats {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    background: var(--surface-sunk);
  }

  h2 {
    font-size: 1.1rem;
  }

  ul {
    display: grid;
    gap: var(--space-2);
    max-width: var(--measure);
    margin: 0;
    padding-left: var(--space-5);
    color: var(--ink-muted);
  }
</style>
