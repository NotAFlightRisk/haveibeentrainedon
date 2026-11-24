declare global {
  interface Window {
    plausible?: ((event: string) => void) & { init(options: { endpoint: string }): void };
  }
}

export function loadPlausible(src: string = import.meta.env.PUBLIC_PLAUSIBLE_SCRIPT) {
  if (!src) return;
  const script = Object.assign(document.createElement('script'), { src, async: true });
  script.onload = () => window.plausible?.init({ endpoint: new URL('/api/event', src).href });
  document.head.append(script);
}

/** Counts an event, quietly doing nothing on builds without Plausible */
export const track = (event: string) => window.plausible?.(event);
