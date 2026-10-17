#!/usr/bin/env node
// Node 24+, no dependencies. Run from any directory: node scripts/import-vocabulary.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const COUNTS = [500, 772, 973, 1000, 1071, 1140, 5636];
const SOURCES = {
  official: {
    repository: 'ivankra/hsk30',
    revision: '4ff9e3915ce87baaecd7ebe263085573a4ea3192',
    file: 'hsk30.csv',
    sha256: '8c2b73f74776240bcf154624730fc6fb2c42c254d5c5d0f88943878b8e575b9b',
  },
  definitions: {
    repository: 'jelleverheyen/hsk-vocabulary',
    revision: 'a66fd30b9580da2c2af7eb19e4b9d8099a29c061',
    file: 'complete.json',
    sha256: 'fc474be223d2196b13bfc7c13e10054f1793c2f840eb1287dfc9620fa0d507d2',
  },
  cedict: {
    repository: 'regisb/CC-CEDICT',
    revision: 'a8e7ebcc6b7d19f6a615f9f1e8b1e3df6fad1e38',
    file: 'cedict_ts.u8',
    sha256: '8b77bf4833807411e7f221c007b97e7982955c790e9655dd4afda36b56283147',
  },
};

async function download(source) {
  const url = `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${source.file}`;
  const response = await fetch(url);
  assert(response.ok, `${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, `Source changed: ${url}`);
  return bytes.toString('utf8');
}

// RFC 4180 quoting, including embedded quotes, commas and newlines.
function parseCsv(text) {
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = !quoted; }
    } else if (!quoted && (char === ',' || char === '\n')) {
      record.push(field.replace(/\r$/, ''));
      field = '';
      if (char === '\n') { records.push(record); record = []; }
    } else { field += char; }
  }
  assert(!quoted, 'Unclosed CSV quote');
  if (field || record.length) { record.push(field.replace(/\r$/, '')); records.push(record); }
  const header = records.shift();
  return records.map((values) => {
    assert.equal(values.length, header.length, 'Malformed CSV row');
    return Object.fromEntries(header.map((key, i) => [key, values[i]]));
  });
}

// Do not lowercase: CC-CEDICT capitalization distinguishes proper names.
const normalizeKey = (key) => key.replaceAll('u:', 'ü');
const reference = /^(?:(?:old |archaic |erhua )?variant of|also written|same as|see(?: also)?)\s*[\p{Script=Han}]/u;
const meaningful = (meaning) => /[A-Za-z]/.test(meaning) && !reference.test(meaning) && !meaning.startsWith('CL:');
const unique = (items) => [...new Set(items)];

const [officialText, definitionsText, cedictText] = await Promise.all(Object.values(SOURCES).map(download));
const rows = parseCsv(officialText);
const definitions = JSON.parse(definitionsText);
const entries = new Map();
const bySpellingPronunciation = new Map();
function indexEntry(key, simplified, traditional, numeric, meanings, origin) {
  key = normalizeKey(key);
  const entry = entries.get(key) ?? { key, simplified, traditional, numeric, modern: [], cedict: [] };
  entry[origin].push(...meanings);
  entries.set(key, entry);
  for (const spelling of unique([simplified, traditional])) {
    const lookup = normalizeKey(`${spelling}[${numeric}]`);
    const keys = bySpellingPronunciation.get(lookup) ?? [];
    if (!keys.includes(key)) keys.push(key);
    bySpellingPronunciation.set(lookup, keys);
  }
}
for (const word of definitions) {
  for (const form of word.forms) {
    const numeric = form.transcriptions.numeric;
    indexEntry(`${form.traditional}|${word.simplified}[${numeric}]`, word.simplified, form.traditional, numeric, form.meanings, 'modern');
  }
}
for (const line of cedictText.split('\n')) {
  const match = /^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/.exec(line.trimEnd());
  if (!match) continue;
  const [, traditional, simplified, numeric, gloss] = match;
  indexEntry(`${traditional}|${simplified}[${numeric}]`, simplified, traditional, numeric, gloss.split('/'), 'cedict');
}

// Follow full, pronunciation-qualified original references, not the truncated
// Chinese links in complete.json (e.g. 无可厚非 incorrectly points to 非 there).
function resolve(key, visited = new Set()) {
  key = normalizeKey(key);
  if (visited.has(key)) return [];
  const entry = entries.get(key);
  if (!entry) return [];
  const next = new Set(visited).add(key);
  const modern = entry.modern.filter(meaningful);
  if (modern.length) return unique(modern);
  const original = entry.cedict.filter(meaningful);
  if (original.length) return unique(original);
  const result = [];
  for (const gloss of entry.cedict.filter((text) => reference.test(text))) {
    const target = /([\p{Script=Han}〇]+)(?:\|([\p{Script=Han}〇]+))?\[([^\]]+)\]/u.exec(gloss);
    if (!target) continue;
    const [, traditional, simplified, numeric] = target;
    const keys = simplified
      ? [`${traditional}|${simplified}[${numeric}]`]
      : (bySpellingPronunciation.get(normalizeKey(`${traditional}[${numeric}]`)) ?? []);
    for (const targetKey of keys) result.push(...resolve(targetKey, next));
  }
  // An explicitly marked erhua alias keeps the same base pronunciation.
  // Do not use the often-truncated target text (大腕儿 points to 腕 upstream).
  if (!result.length && entry.modern.some((gloss) => gloss.startsWith('erhua variant of ')) &&
      entry.simplified.endsWith('儿') && entry.numeric.endsWith(' r5')) {
    const lookup = normalizeKey(`${entry.simplified.slice(0, -1)}[${entry.numeric.slice(0, -3)}]`);
    for (const targetKey of bySpellingPronunciation.get(lookup) ?? []) result.push(...resolve(targetKey, next));
  }
  // Same pronunciation and simplified spelling, different traditional variant.
  // This is important for 紮實/扎實 aliases.
  if (!result.length) {
    const keys = bySpellingPronunciation.get(normalizeKey(`${entry.simplified}[${entry.numeric}]`)) ?? [];
    for (const targetKey of keys) result.push(...resolve(targetKey, next));
  }
  return unique(result);
}

// Editorial, ID-scoped mappings, NOT a generic fallback. Evidence is either
// a full dictionary entry or the exact component entries for a productive phrase.
// The importer verifies every evidence key; the README explains disagreements.
const OVERRIDES = {
  'L1-0044': ['on or in a vehicle', ['車|车[che1]', '上|上[shang4]']],
  'L1-0471': ['really; truly; indeed', ['真|真[zhen1]', '的|的[de5]']],
  'L2-0034': ['not very; not too', ['不|不[bu4]', '太|太[tai4]']],
  'L2-0044': ['soon; in a short while', ['不一會|不一会[bu4 yi1 hui4]']],
  'L2-0264': ['to have seen or met before', ['見|见[jian4]', '過|过[guo4]']],
  'L2-0507': ['to deliver to; to send to a destination', ['送|送[song4]', '到|到[dao4]']],
  'L2-0611': ['joke; jest; to laugh at; to mock', ['笑話|笑话[xiao4 hua4]']],
  'L2-0684': ['to have time; to be free or available', ['有空|有空[you3 kong4]']],
  'L2-0722': ['at this time; at this moment', ['這時|这时[zhe4 shi2]']],
  'L3-0192': ['to put or place in, on or at', ['放|放[fang4]', '到|到[dao4]']],
  'L3-0508': ['can or cannot; whether someone can (A-not-A question)', ['能|能[neng2]', '不|不[bu4]']],
  'L4-0189': ['electric vehicle', ['電動|电动[dian4 dong4]', '車|车[che1]']],
  'L4-0479': ['either side; both sides', ['兩邊|两边[liang3 bian5]']],
  'L4-0505': ['to have no way of doing something; unable to do anything about it', ['沒法|没法[mei2 fa3]']],
  'L4-0522': ['famous brand; designer label', ['名牌|名牌[ming2 pai2]']],
  'L4-0853': ["in the eyes of; in someone's estimation", ['眼|眼[yan3]', '裡|里[li3]']],
  'L4-0897': ['to have strength or energy; energetic', ['有|有[you3]', '勁|劲[jin4]']],
  'L5-0108': ['in the city; in town', ['城|城[cheng2]', '裡|里[li3]']],
  'L5-0326': ['lane; alley', ['胡同|胡同[hu2 tong4]']],
  'L5-0406': ["as far as possible; to do one's utmost", ['儘可能|尽可能[jin3 ke3 neng2]']],
  'L5-0840': ['thief', ['小偷|小偷[xiao3 tou1]']],
  'L6-0376': ['hard to say; difficult to judge or predict', ['難說|难说[nan2 shuo1]']],
  'L6-0957': ['a bout or round of; a spell of (an action or activity)', ['一|一[yi1]', '番|番[fan1]']],
  'L6-1079': ['to point at; pointing at', ['指|指[zhi3]', '著|着[zhe5]']],
  'L7-0253': ['to be unfavorable or detrimental to', ['不利|不利[bu4 li4]', '於|于[yu2]']],
  'L7-0283': ['to refuse; to be unwilling', ['不|不[bu4]', '肯|肯[ken3]']],
  'L7-0286': ['not difficult; not hard', ['不|不[bu4]', '難|难[nan2]']],
  'L7-0290': ['it would be better to say; rather', ['不如|不如[bu4 ru2]', '說|说[shuo1]']],
  'L7-0300': ['not to grant; to withhold; to refuse', ['不|不[bu4]', '予|予[yu3]']],
  'L7-0443': ['while; taking advantage of (a time or opportunity)', ['趁|趁[chen4]', '著|着[zhe5]']],
  'L7-0691': ['large (sum of money or transaction)', ['大|大[da4]', '筆|笔[bi3]']],
  'L7-0896': ['to designate as; to determine to be', ['定|定[ding4]', '為|为[wei2]']],
  'L7-1092': ['to fly to; bound for (a flight)', ['飛|飞[fei1]', '往|往[wang3]']],
  'L7-1362': ['public-interest character; public-welfare nature', ['公益|公益[gong1 yi4]', '性|性[xing4]']],
  'L7-1743': ['to harbor (a feeling); with (an intention or feeling)', ['懷|怀[huai2]', '著|着[zhe5]']],
  'L7-2561': ['excessive; beyond reasonable limits; unreasonable', ['離譜|离谱[li2 pu3]']],
  'L7-2972': ['hard to imagine; unimaginable', ['難以|难以[nan2 yi3]', '想象|想象[xiang3 xiang4]']],
  'L7-3893': ['speaking of; when it comes to; to begin speaking', ['說|说[shuo1]', '起來|起来[qi5 lai5]']],
  'L7-3993': ['to only want to have fun; to be too fond of playing', ['貪玩|贪玩[tan1 wan2]']],
  'L7-4046': ['specially made; custom-made', ['特|特[te4]', '製|制[zhi4]']],
  'L7-4577': ['to copy; to imitate', ['仿傚|仿效[fang3 xiao4]']],
  'L7-4768': ['to delay; to be held up; to miss (an opportunity)', ['延誤|延误[yan2 wu5]']],
  'L7-5399': ["to devote one's efforts to; to work for", ['致力|致力[zhi4 li4]', '於|于[yu2]']],
  'L7-5538': ["to focus on; to have one's sights on", ['著眼|着眼[zhuo2 yan3]', '於|于[yu2]']],
  'L7-5636': ['to bear witness; to testify', ['作證|作证[zuo4 zheng4]']],
  // Numbered homographs are separate official identities, not duplicate cards.
  'L2-0062': ['to weigh', ['稱|称[cheng1]']],
  'L5-0101': ['to call; to name; to state; to praise', ['稱|称[cheng1]']],
  // Keep bound forms on their official affix sense, not unrelated free-word senses.
  'L1-0075': ['prefix indicating an ordinal number (e.g. second)', ['第|第[di4]']],
  'L2-0257': ['noun suffix for a specialist or expert; -ist; -er', ['家|家[jia1]']],
  'L2-0340': ['familiar or affectionate prefix before a surname', ['老|老[lao3]']],
  'L2-0602': ['young; junior (familiar prefix before a surname)', ['小|小[xiao3]']],
  'L3-0103': ['beginning; first (prefix for the first ten days of a lunar month)', ['初|初[chu1]']],
  'L3-0810': ['suffix expressing a property or quality; -ness; -ity', ['性|性[xing4]']],
  'L3-0869': ['person; employee; member (noun suffix)', ['員|员[yuan2]']],
  'L3-0885': ['one who is or does; person involved in; -er; -ist (suffix)', ['者|者[zhe3]']],
  'L5-0559': ['article; commodity; product; goods (suffix)', ['品|品[pin3]']],
  'L6-0453': ['realm; circle; field of activity (suffix)', ['界|界[jie4]']],
  'L6-0536': ['power; force; strength; ability (suffix)', ['力|力[li4]']],
  'L6-1043': ['chief; head; leader (suffix)', ['長|长[zhang3]']],
  'L6-1128': ['social group; people sharing a characteristic (suffix)', ['族|族[zu2]']],
  'L7-0948': ['degree; extent; degree of intensity (suffix)', ['度|度[du4]']],
  'L7-1095': ['non-; un-; not (prefix)', ['非|非[fei1]']],
  'L7-1257': ['feeling; sense of (suffix)', ['感|感[gan3]']],
  'L7-2733': ['rate; frequency (suffix)', ['率|率[lu:4]']],
  'L7-4858': ['industry; line of business; occupation (suffix)', ['業|业[ye4]']],
};

const levels = COUNTS.map(() => []);
const usedOverrides = new Set();
const coverage = { exactDictionary: 0, editorial: 0, resolvedReferences: 0 };
for (const row of rows) {
  const level = row.Level === '7-9' ? 7 : Number(row.Level);
  assert(Number.isInteger(level) && level >= 1 && level <= 7, `Bad level: ${row.ID}`);
  const index = levels[level - 1].length + 1;
  assert.equal(row.ID, `L${level}-${String(index).padStart(4, '0')}`, 'Official IDs/order changed');
  const variants = row.Variants ? JSON.parse(row.Variants).filter((variant) => !variant.Example) : [];
  const primary = variants[0] ?? row;
  const hanzi = primary.Simplified;
  const pronunciations = variants.length
    ? unique(variants.filter((variant) => variant.Simplified === hanzi).map((variant) => variant.Pinyin)).join(' / ')
    : row.Pinyin;
  let meanings;
  if (Object.hasOwn(OVERRIDES, row.ID)) {
    const [meaning, evidence] = OVERRIDES[row.ID];
    for (const key of evidence) assert(entries.has(normalizeKey(key)), `Missing evidence: ${row.ID}: ${key}`);
    meanings = [meaning];
    usedOverrides.add(row.ID);
    coverage.editorial++;
  } else {
    const keys = row.CEDICT.split('/').filter(Boolean);
    assert(keys.length, `No dictionary keys: ${row.ID}`);
    meanings = unique(keys.flatMap((key) => resolve(key)));
    assert(meanings.length, `Unresolved definition: ${row.ID} ${row.Simplified}`);
    if (keys.some((key) => !(entries.get(normalizeKey(key))?.modern.some(meaningful)))) coverage.resolvedReferences++;
    coverage.exactDictionary++;
  }
  const word = { id: row.ID, level, hanzi, pinyin: pronunciations, meaning: meanings.join('; '), speech: hanzi };
  assert(/^[\p{Script=Han}〇]+$/u.test(word.hanzi), `Unclean hanzi: ${row.ID}: ${word.hanzi}`);
  assert(/[a-züāēīōūǖáéíóúǘǎěǐǒǔǚàèìòùǜ]/i.test(word.pinyin), `Invalid pinyin: ${row.ID}`);
  assert(!/[0-9]/.test(word.pinyin), `Unclean pinyin: ${row.ID}`);
  assert(meaningful(word.meaning), `Not an English definition: ${row.ID}`);
  assert(!/(?:not available|unknown translation|translation unavailable)/i.test(word.meaning), `Placeholder: ${row.ID}`);
  for (const [field, value] of Object.entries(word)) assert(typeof value === (field === 'level' ? 'number' : 'string') && String(value).trim(), `Empty ${field}: ${row.ID}`);
  levels[level - 1].push(word);
}
assert.deepEqual(levels.map((words) => words.length), COUNTS, 'Not the official new-word counts');
assert.equal(rows.length, 11092);
assert.equal(new Set(levels.flat().map((word) => word.id)).size, 11092, 'Duplicate IDs');
assert.equal(usedOverrides.size, Object.keys(OVERRIDES).length, 'Stale override');

// Validate everything before writing any published level file. No timestamps,
// randomization or mutable URLs: identical inputs always serialize identically.
const output = new URL('../public/data/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [index, words] of levels.entries()) {
  await writeFile(new URL(`level-${index + 1}.json`, output), `${JSON.stringify(words, null, 2)}\n`);
}
console.log(JSON.stringify({ counts: levels.map((words) => words.length), total: rows.length, coverage, sources: SOURCES }, null, 2));
