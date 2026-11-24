// Lists infini-gram indexes we haven't seen before, and broken ones that have started answering
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const V4 = 'https://api.infini-gram.io/';
const APIS = {
  [V4]: 'https://infini-gram.readthedocs.io/en/latest/api.html',
  'https://api.infini-gram-mini.io/': 'https://infini-gram-mini.readthedocs.io/en/latest/api.html'
};
const { seen, broken } = JSON.parse(
  await readFile(new URL('indexes.json', import.meta.url), 'utf8')
);
const known = new Set([...seen, ...broken]);

async function probe(api, index) {
  try {
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index, query_type: 'count', query: 'the cat sat on the mat' }),
      signal: AbortSignal.timeout(30_000)
    });
    const body = await response.json();
    return body.error ? `doesn't answer yet (${body.error})` : 'answers';
  } catch (error) {
    return `doesn't answer yet (${error.message})`;
  }
}

// the docs never listed OLMo 3's, so they're tried by name until they work
const mended = [];
for (const index of broken) {
  const answer = await probe(V4, index);
  if (answer === 'answers') mended.push(`- \`${index}\` answers now, after failing for months`);
  await sleep(2_000);
}

const found = [];
for (const [api, docs] of Object.entries(APIS)) {
  const html = await (await fetch(docs, { signal: AbortSignal.timeout(30_000) })).text();
  const fresh = new Set(
    (html.match(/\bv\d_[a-z0-9_-]+/gi) ?? []).filter((name) => !known.has(name))
  );
  for (const index of fresh) {
    found.push(`- \`${index}\` on ${new URL(api).host}: ${await probe(api, index)}`);
    await sleep(2_000);
  }
}

if (found.length || mended.length) {
  console.log(`Some infini-gram indexes are worth a look:

${[...found, ...mended].join('\n')}

A new training set or crawl goes in \`src/lib/corpora.ts\` with its model line, once it answers, and on \`/about\`. Either way, file the name under \`seen\` in \`scripts/indexes.json\` (out of \`broken\`, if it was there) so it isn't raised again.`);
}
