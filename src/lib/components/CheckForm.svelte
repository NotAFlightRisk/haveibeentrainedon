<script lang="ts">
  import { enhance } from '$app/forms';
  import { turnstile } from '#lib/turnstile.ts';

  interface Props {
    sitekey?: string;
    value?: string;
    force?: boolean;
    error?: string;
  }

  let { sitekey, value = '', force = false, error }: Props = $props();
  let sending = $state(false);
  let tries = $state(0);
</script>

<form
  method="POST"
  action="/?/check"
  use:enhance={() => {
    sending = true;
    return async ({ update }) => {
      await update({ reset: false });
      sending = false;
      tries++;
    };
  }}
>
  <label for="address" class="visually-hidden">Address of a page you wrote</label>
  <div class="box">
    <input
      id="address"
      name="url"
      type="text"
      inputmode="url"
      autocomplete="url"
      autocapitalize="off"
      spellcheck="false"
      placeholder="yourblog.com/a-post-you-wrote"
      required
      {value}
      aria-describedby={error ? 'check-error' : undefined}
    />
    <button disabled={sending}>{sending ? 'Fetching...' : 'Check'}</button>
  </div>
  {#if force}
    <input type="hidden" name="force" value="1" />
  {/if}
  {#if sitekey}
    <div class="human" use:turnstile={{ sitekey, tries }}></div>
  {/if}
  {#if error}
    <p id="check-error" class="error" role="alert">{error}</p>
  {/if}
</form>

<style>
  form {
    display: grid;
    gap: var(--space-3);
    width: 100%;
  }

  .box {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--surface);
    border-radius: var(--radius-control);
    box-shadow: var(--shadow-box);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: var(--space-3) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius-control) - 2px);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1.1rem;
    caret-color: var(--accent);

    &::placeholder {
      color: var(--ink-faint);
    }

    &:focus-visible {
      outline-offset: 0;
    }
  }

  button {
    padding: var(--space-3) var(--space-5);
    border: 0;
    border-radius: calc(var(--radius-control) - 2px);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: filter 160ms var(--ease-out);

    &:hover {
      filter: brightness(1.08);
    }

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

  @media (width < 30rem) {
    .box {
      flex-direction: column;
    }
  }
</style>
