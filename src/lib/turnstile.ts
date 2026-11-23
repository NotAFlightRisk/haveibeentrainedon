declare global {
  interface Window {
    turnstile: {
      render(node: HTMLElement, options: { sitekey: string; size?: string }): string;
      reset(id: string): void;
      remove(id: string): void;
    };
  }
}

let loading: Promise<void> | undefined;

const load = () =>
  (loading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), {
      src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      async: true,
      onload: () => resolve(),
      onerror: reject
    });
    document.head.append(script);
  }));

/** Puts Cloudflare's person check in a node, and resets it whenever `tries` moves on */
export function turnstile(node: HTMLElement, { sitekey }: { sitekey: string; tries: number }) {
  let id: string | undefined;
  let gone = false;
  load()
    .then(() => {
      if (!gone) id = window.turnstile.render(node, { sitekey, size: 'flexible' });
    })
    .catch(() => node.append("The person check didn't load, so fresh checks won't work."));
  return {
    update: () => id && window.turnstile.reset(id),
    destroy: () => {
      gone = true;
      if (id) window.turnstile.remove(id);
    }
  };
}
