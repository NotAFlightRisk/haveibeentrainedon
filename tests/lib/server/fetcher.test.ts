import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAddress, fetchPage, isPublicAddress } from '#lib/server/fetcher.ts';

describe('checkAddress', () => {
  it.each([
    'http://127.0.0.1/',
    'http://0177.0.0.1/',
    'http://2130706433/',
    'http://[::1]/',
    'http://localhost/',
    'http://printer.local/',
    'https://example.com:8443/',
    'https://user:pass@example.com/',
    'ftp://example.com/',
    'file:///etc/passwd'
  ])('refuses %s', (url) => {
    expect(() => checkAddress(url)).toThrow();
  });

  it('accepts an ordinary blog post', () => {
    expect(checkAddress('https://blog.example.co.uk/2024/a-post?page=2').hostname).toBe(
      'blog.example.co.uk'
    );
  });
});

describe('isPublicAddress', () => {
  it.each([
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '2001:db8::1',
    '64:ff9b::7f00:1'
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.215.14', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e'])(
    'allows %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    }
  );
});

describe('fetchPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const dns = (address: string) =>
    Response.json({ Answer: [{ type: address.includes(':') ? 28 : 1, data: address }] });

  function stub(hosts: Record<string, string>, pages: Record<string, () => Response>) {
    const fetch = vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.hostname === 'cloudflare-dns.com') {
        const name = url.searchParams.get('name')!;
        const type = url.searchParams.get('type');
        return type === 'A' ? dns(hosts[name]) : Response.json({});
      }
      return pages[url.href]();
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  const html = (body: string) =>
    new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

  it('follows a redirect to another public site', async () => {
    stub(
      { 'a.example.com': '93.184.215.14', 'b.example.com': '93.184.215.15' },
      {
        'https://a.example.com/': () =>
          new Response(null, { status: 301, headers: { location: 'https://b.example.com/post' } }),
        'https://b.example.com/post': () => html('<p>hello</p>')
      }
    );
    const page = await fetchPage('https://a.example.com/');
    expect(page.url.href).toBe('https://b.example.com/post');
    expect(page.html).toBe('<p>hello</p>');
  });

  it('refuses a redirect that lands on a private address', async () => {
    const fetch = stub(
      { 'a.example.com': '93.184.215.14', 'sneaky.example.com': '169.254.169.254' },
      {
        'https://a.example.com/': () =>
          new Response(null, { status: 302, headers: { location: 'https://sneaky.example.com/' } })
      }
    );
    await expect(fetchPage('https://a.example.com/')).rejects.toMatchObject({ reason: 'address' });
    expect(fetch.mock.calls.map(([url]) => new URL(url).hostname)).not.toContain(
      'sneaky.example.com'
    );
  });

  it('gives up after three redirects', async () => {
    stub(
      { 'loop.example.com': '93.184.215.14' },
      {
        'https://loop.example.com/': () =>
          new Response(null, { status: 302, headers: { location: 'https://loop.example.com/' } })
      }
    );
    await expect(fetchPage('https://loop.example.com/')).rejects.toThrow('redirects more than 3');
  });

  it("won't read anything that isn't HTML", async () => {
    stub(
      { 'a.example.com': '93.184.215.14' },
      {
        'https://a.example.com/file.pdf': () =>
          new Response('%PDF', { headers: { 'content-type': 'application/pdf' } })
      }
    );
    await expect(fetchPage('https://a.example.com/file.pdf')).rejects.toMatchObject({
      reason: 'not-html'
    });
  });
});
