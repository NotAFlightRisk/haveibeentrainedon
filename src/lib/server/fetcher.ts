export const USER_AGENT = 'HaveIBeenTrainedOn/1.0 (+https://haveibeentrainedon.peng.ly/about)';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HOPS = 3;
const TIMEOUT_MS = 10_000;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const PRIVATE_SUFFIX = /\.(local|localhost|internal|intranet|lan|home|corp|arpa|test|invalid)$/i;

/** A host without its www, so the two count as one site */
export const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

export class FetchError extends Error {
  constructor(
    readonly reason: 'address' | 'unreachable' | 'refused' | 'not-html' | 'too-big' | 'timeout',
    message: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/** Only a plain http(s) address with a real domain name on the usual ports gets fetched */
export function checkAddress(input: string | URL) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError('address', "That doesn't look like a web address.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) {
    throw new FetchError('address', 'Only plain http and https addresses can be checked.');
  }
  if (!HOSTNAME.test(url.hostname) || PRIVATE_SUFFIX.test(url.hostname)) {
    throw new FetchError('address', 'That needs to be a public website, not an IP or local name.');
  }
  return url;
}

const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPublicV4(address: string) {
  const octets = DOTTED_QUAD.exec(address)?.slice(1).map(Number);
  if (!octets || octets.some((octet) => octet > 255)) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

const groups = (address: string) => {
  const [head, tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((group) => parseInt(group, 16));
};

/** Global unicast only, minus documentation and the ranges that tunnel to an IPv4 address */
function isPublicV6(address: string) {
  if (address.includes('.')) return false;
  const [first, second] = groups(address);
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && (second === 0x0db8 || second < 0x0200)) return false;
  return first !== 0x2002;
}

export const isPublicAddress = (address: string) =>
  address.includes(':') ? isPublicV6(address) : isPublicV4(address);

interface DnsAnswer {
  type: number;
  data: string;
}

async function resolve(hostname: string, deadline: AbortSignal) {
  const signal = AbortSignal.any([deadline, AbortSignal.timeout(5_000)]);
  const ask = async (type: 'A' | 'AAAA') => {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal }
    );
    const body = (await response.json()) as { Answer?: DnsAnswer[] };
    return (body.Answer ?? []).filter(({ type }) => type === 1 || type === 28);
  };
  const answers = (await Promise.all([ask('A'), ask('AAAA')])).flat();
  if (!answers.length) throw new FetchError('unreachable', "We couldn't find that website.");
  if (!answers.every(({ data }) => isPublicAddress(data))) {
    throw new FetchError('address', 'That name points somewhere private, so we left it alone.');
  }
}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('too-big', "That page is over 2 MB, which is more than we'll read.");
    }
    chunks.push(read.value);
  }
  const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1];
  const bytes = new Uint8Array(size);
  chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.byteLength), 0);
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const KINDS = {
  html: { accept: 'text/html,application/xhtml+xml', type: /text\/html|application\/xhtml/i },
  xml: {
    accept: 'application/xml,text/xml,application/rss+xml,application/atom+xml',
    type: /xml/i
  },
  text: { accept: 'text/plain', type: /text\/plain/i }
};

/** Fetches one public page, HTML unless told otherwise, checking every hop of every redirect */
export async function fetchPage(input: string | URL, kind: keyof typeof KINDS = 'html') {
  const { accept, type } = KINDS[kind];
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  let url = checkAddress(input);
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      await resolve(url.hostname, deadline);
      const response = await fetch(url, {
        redirect: 'manual',
        signal: deadline,
        headers: { 'user-agent': USER_AGENT, accept }
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        url = checkAddress(new URL(location, url));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new FetchError(
          'refused',
          `That site wouldn't hand the page over (it answered ${response.status}).`
        );
      }
      if (!type.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel();
        throw new FetchError('not-html', "That isn't a web page we can read.");
      }
      return { url, body: await readCapped(response) };
    }
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (deadline.aborted) throw new FetchError('timeout', 'The site took over 10 seconds.');
    throw new FetchError('unreachable', "We couldn't reach that website.");
  }
  throw new FetchError('refused', 'That page redirects more than 3 times.');
}
