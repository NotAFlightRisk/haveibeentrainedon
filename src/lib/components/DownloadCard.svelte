<script lang="ts">
  import { drawCard, hostOf } from '#lib/card.ts';
  import { track } from '#lib/plausible.ts';
  import type { Result } from '#lib/server/result.ts';

  let { result }: { result: Result } = $props();
  let drawing = $state(false);

  async function download() {
    drawing = true;
    try {
      const href = URL.createObjectURL(await drawCard(result));
      const download = `haveibeentrainedon-${hostOf(result.url) || 'pasted-text'}.png`;
      Object.assign(document.createElement('a'), { href, download }).click();
      setTimeout(() => URL.revokeObjectURL(href));
      track('Download');
    } finally {
      drawing = false;
    }
  }
</script>

<button type="button" onclick={download} disabled={drawing}>
  {drawing ? 'Drawing...' : 'Download image'}
</button>

<style>
  button {
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 160ms var(--ease-out);

    &:hover {
      border-color: var(--ink-muted);
    }

    &:disabled {
      cursor: progress;
      color: var(--ink-muted);
    }
  }
</style>
