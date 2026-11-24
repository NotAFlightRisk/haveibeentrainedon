<script lang="ts">
  import type { CellVerdict } from '#lib/server/result.ts';
  import { STAMPS } from '#lib/share.ts';

  interface Props {
    verdict: CellVerdict;
    delay?: number;
    /** For a table cell, where the column already says what was searched */
    short?: boolean;
  }

  let { verdict, delay = 0, short = false }: Props = $props();

  const words: Record<CellVerdict, string> = $derived({
    ...STAMPS,
    none: short ? 'No match' : STAMPS.none
  });
</script>

{#key verdict}
  <p class="stamp {verdict}" class:short style:--delay="{delay}ms">{words[verdict]}</p>
{/key}

<style>
  .stamp {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border: 3px double currentColor;
    border-radius: var(--radius-control);
    font-weight: 800;
    font-size: 1.05rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1.3;
    transform: rotate(-5deg);
    filter: url(#ink);
    animation: press 520ms var(--ease-out) var(--delay) backwards;

    &.match {
      color: var(--stamp-match);
      font-size: 1.35rem;
    }

    &.none {
      color: var(--stamp-none);
      border: 1px solid currentColor;
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.03em;
      text-transform: none;
      transform: rotate(-2deg);
      filter: url(#ink-faint);
    }

    &.new {
      color: var(--stamp-date);
    }

    &.pending {
      color: var(--stamp-pending);
      border: 1px dashed currentColor;
      font-weight: 500;
      font-size: 0.8rem;
      transform: none;
      filter: none;
      animation: none;
    }

    &.failed {
      color: var(--stamp-none);
      border-style: dashed;
      font-size: 0.85rem;
      filter: url(#ink-faint);
    }

    &.short {
      padding-inline: var(--space-2);
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      white-space: nowrap;

      &.match {
        font-size: 1rem;
      }
    }
  }

  @keyframes press {
    from {
      opacity: 0;
      transform: scale(1.6) rotate(3deg);
    }
    55% {
      opacity: 1;
    }
  }
</style>
