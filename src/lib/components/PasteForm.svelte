<script lang="ts">
  import { enhance } from '$app/forms';
  import { track } from '#lib/plausible.ts';
  import { hashSpan, pastedSpans } from '#lib/spans.ts';
  import { turnstile } from '#lib/turnstile.ts';

  let { sitekey, error }: { sitekey?: string; error?: string } = $props();
  let sending = $state(false);
  let tries = $state(0);

  // the server keeps only fingerprints, so the browser holds on to the sentences it'll show
  async function remember(text: string) {
    for (const span of pastedSpans(text)) {
      const hash = await hashSpan(span);
      try {
        sessionStorage.setItem(`span:${hash}`, span);
      } catch {
        return;
      }
    }
  }
</script>

<form
  method="POST"
  action="/?/paste"
  use:enhance={async ({ formData }) => {
    sending = true;
    await remember(String(formData.get('text') ?? ''));
    return async ({ result, update }) => {
      if (result.type === 'redirect') track('Check');
      await update({ reset: false });
      sending = false;
      tries++;
    };
  }}
>
  <label for="pasted">A few paragraphs you wrote</label>
  <textarea
    id="pasted"
    name="text"
    rows="7"
    required
    minlength="200"
    maxlength="100000"
    aria-describedby="paste-note{error ? ' paste-error' : ''}"></textarea>
  <p id="paste-note" class="fine">
    Three sentences from it go to infini-gram's servers at the University of Washington to be
    searched, so only paste text that's already public. We don't keep the text, just fingerprints of
    those sentences and their counts.
  </p>
  {#if sitekey}
    <div use:turnstile={{ sitekey, tries }}></div>
  {/if}
  <button disabled={sending}>{sending ? 'Picking sentences...' : 'Check the text'}</button>
  {#if error}
    <p id="paste-error" class="error" role="alert">{error}</p>
  {/if}
</form>

<style>
  form {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
    width: 100%;
  }

  label {
    font-weight: 600;
  }

  textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    line-height: 1.5;
    resize: vertical;
    caret-color: var(--accent);
  }

  .fine {
    font-size: 0.9rem;
    color: var(--shell-muted);
  }

  button {
    padding: var(--space-2) var(--space-5);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;

    &:disabled {
      cursor: progress;
      filter: saturate(0.6);
    }
  }

  .error {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--stamp-match);
    font-weight: 600;
  }
</style>
