// Lists infini-gram indexes we haven't seen before, and whether each one answers yet
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const APIS = {
  'https://api.infini-gram.io/': 'https://infini-gram.readthedocs.io/en/latest/api.html',
  'https://api.infini-gram-mini.io/': 'https://infini-gram-mini.readthedocs.io/en/latest/api.html'
};
const known = new Set(JSON.parse(await readFile(new URL('indexes.json', import.meta.url), 'utf8')));

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

if (found.length) {
  console.log(`The infini-gram docs list ${found.length === 1 ? 'an index' : 'indexes'} we haven't seen:

${found.join('\n')}

A new training set or crawl goes in \`src/lib/corpora.ts\` with its model line, once it answers. Either way, add the name to \`scripts/indexes.json\` so it isn't raised again.`);
}
