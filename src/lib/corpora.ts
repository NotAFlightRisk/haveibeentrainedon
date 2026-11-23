export type Api = 'v4' | 'mini';
export type Sources = 'urls' | 'slice' | 'part';

export interface Corpus {
  id: string;
  name: string;
  index: string;
  api: Api;
  /** what the row shows as the snapshot date */
  snapshot: string;
  /** the newest page anything in the set could hold, so "too new" never skips a page that's in */
  newest: string;
  models: string;
  sources?: Sources;
  note?: string;
  card: string;
}

export const SETS: Corpus[] = [
  {
    id: 'c4',
    name: 'C4',
    index: 'v4_c4train_llama',
    api: 'v4',
    snapshot: 'April 2019',
    newest: '2019-04-30',
    models: "Trained Google's T5, and was about 15% of Meta's LLaMA 1 mix",
    sources: 'urls',
    card: 'https://huggingface.co/datasets/allenai/c4'
  },
  {
    id: 'pile',
    name: 'The Pile',
    index: 'v4_piletrain_llama',
    api: 'v4',
    snapshot: '2020',
    newest: '2020-12-31',
    models: "Trained EleutherAI's GPT-J, GPT-NeoX-20B and Pythia",
    sources: 'part',
    card: 'https://arxiv.org/abs/2101.00027'
  },
  {
    id: 'rpj',
    name: 'RedPajama',
    index: 'v4_rpj_llama_s4',
    api: 'v4',
    snapshot: 'February 2023',
    newest: '2023-03-31',
    models: 'Trained RedPajama-INCITE and OpenLLaMA',
    sources: 'slice',
    card: 'https://huggingface.co/datasets/togethercomputer/RedPajama-Data-1T'
  },
  {
    id: 'dolma',
    name: 'Dolma 1.7',
    index: 'v4_dolma-v1_7_llama',
    api: 'v4',
    snapshot: 'March 2023',
    newest: '2023-10-31',
    models: "Trained Ai2's OLMo 1.7",
    sources: 'urls',
    card: 'https://huggingface.co/datasets/allenai/dolma'
  },
  {
    id: 'dclm',
    name: 'DCLM',
    index: 'v4_dclm-baseline_llama',
    api: 'v4',
    snapshot: '2022',
    newest: '2022-12-31',
    models: "Trained DCLM-7B, and is nearly all of Ai2's OLMo 2 mix",
    sources: 'urls',
    note: 'It keeps only the pages a quality filter liked best, which leaves out most small blogs.',
    card: 'https://huggingface.co/datasets/mlfoundations/dclm-baseline-1.0'
  }
];

const crawl = (id: string, month: string, newest: string): Corpus => ({
  id: `cc-${id}`,
  name: `${month} 2025 crawl`,
  index: `v2_cc-${id}`,
  api: 'mini',
  snapshot: `${month} 2025`,
  newest,
  models: "No one model. It's the raw crawl most web training sets are cut from, FineWeb too",
  card: 'https://commoncrawl.org/latest-crawl'
});

export const CRAWLS: Corpus[] = [
  crawl('2025-05', 'January', '2025-01-31'),
  crawl('2025-08', 'February', '2025-02-28'),
  crawl('2025-13', 'March', '2025-03-31'),
  crawl('2025-18', 'April', '2025-04-30'),
  crawl('2025-21', 'May', '2025-05-31'),
  crawl('2025-26', 'June', '2025-06-30'),
  crawl('2025-30', 'July', '2025-07-31')
];

export const [SCREEN] = CRAWLS;
export const TIMELINE = [CRAWLS[0], CRAWLS[6]];
export const BETWEEN = CRAWLS.slice(1, 6);
export const ALL = [...SETS, ...CRAWLS];

export const byIndex = (index: string) => ALL.find((corpus) => corpus.index === index);
