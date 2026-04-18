#!/usr/bin/env node
// =============================================================
// MD Meta Terminal — Weekly Update Script
// -------------------------------------------------------------
// Master Duel Meta の公開APIから最新データを取得し、
// data.json を更新する。GitHub Actions から毎週金曜に実行される想定。
//
// 使い方:
//   node scripts/update-meta.mjs          # 実書き込み
//   node scripts/update-meta.mjs --dry    # 差分のみ表示（書き込まない）
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data.json');
const MAP_PATH = path.join(__dirname, 'deck-name-map.json');

const DRY = process.argv.includes('--dry');
const UA = 'MD-Meta-Weekly/1.0 (+https://github.com/)';

const API = {
  masterPop: 'https://www.masterduelmeta.com/api/v1/deck-types?masterPopRank%5B%24gt%5D=0&sort=-masterPopRank,name&fields=name,masterPopRank,masterPopRankTrend&limit=50',
  tournamentPower: 'https://www.masterduelmeta.com/api/v1/deck-types?tournamentPower%5B%24gte%5D=1&limit=0&sort=-tournamentPower&fields=name,tournamentPower,tournamentPowerTrend',
  banlist: 'https://www.masterduelmeta.com/api/v1/banlist-changes?date%5B%24exists%5D=true&sort=-date&limit=1',
  latestSet: 'https://www.masterduelmeta.com/api/v1/sets?type%5B%24ne%5D=Structure%20Deck&sort=-release&limit=1',
};

// ---------- helpers ----------
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// power 値から Tier を決定。MDM公式の閾値に近い形で近似。
//   S+: power >= 15 (Tier 0 相当)
//   S : power >= 8
//   A : power >= 4
//   B : power >= 2
//   C : power >= 1
function powerToTier(power) {
  if (power >= 15) return 'S+';
  if (power >= 8) return 'S';
  if (power >= 4) return 'A';
  if (power >= 2) return 'B';
  return 'C';
}

// MDMのtrend文字列を正規化。空/nullなら nullを返し、呼び元で既存値を維持させる。
function normalizeTrend(trend) {
  if (trend === 'up') return 'up';
  if (trend === 'down') return 'down';
  if (trend === '' || trend == null) return null;
  return 'flat';
}

// ---------- main ----------
async function main() {
  console.log('🃏 MD Meta Weekly Update');
  console.log('  dry-run:', DRY);
  console.log('');

  const [masterPop, tourneyPower, banlistArr, setArr] = await Promise.all([
    fetchJson(API.masterPop),
    fetchJson(API.tournamentPower),
    fetchJson(API.banlist),
    fetchJson(API.latestSet),
  ]);

  console.log(`  📊 MDM master pop decks: ${masterPop.length}`);
  console.log(`  🏆 MDM tournament power decks: ${tourneyPower.length}`);

  // --- deck-name-map と照合してMDM→data.json idへマージ
  const nameMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  // MDM英語名をキーに { power, pop, trend } を集約
  const mdmByEn = new Map();
  for (const row of tourneyPower) {
    mdmByEn.set(row.name, { power: row.tournamentPower, powerTrend: row.tournamentPowerTrend });
  }
  for (const row of masterPop) {
    const cur = mdmByEn.get(row.name) || {};
    cur.pop = row.masterPopRank;
    cur.popTrend = row.masterPopRankTrend;
    mdmByEn.set(row.name, cur);
  }

  const changes = [];
  const unknownMdm = [];

  for (const [enName, stats] of mdmByEn.entries()) {
    const deckId = nameMap[enName];
    if (deckId === null) continue; // マップで明示的にスキップ
    if (!deckId) {
      unknownMdm.push(enName);
      continue;
    }
    const deck = data.decks.find(d => d.id === deckId);
    if (!deck) {
      unknownMdm.push(`${enName} (mapped to ${deckId} but not found)`);
      continue;
    }

    const oldUsage = deck.usageRate;
    const oldTier = deck.tier;
    const newUsage = stats.pop ?? oldUsage;
    const newTier = stats.power ? powerToTier(stats.power) : oldTier;
    const rawTrend = stats.popTrend || stats.powerTrend;
    const normalized = normalizeTrend(rawTrend);
    // MDMがtrendを返さない場合は使用率の変動から自分で推定
    let newTrend;
    if (normalized) {
      newTrend = normalized;
    } else if (newUsage - oldUsage >= 1.0) {
      newTrend = 'up';
    } else if (newUsage - oldUsage <= -1.0) {
      newTrend = 'down';
    } else {
      newTrend = deck.trend || 'stable';
    }

    if (Math.abs(newUsage - oldUsage) >= 0.1 || newTier !== oldTier || deck.trend !== newTrend) {
      changes.push({
        id: deckId,
        nameJa: deck.nameJa,
        usage: [oldUsage, newUsage],
        tier: [oldTier, newTier],
        trend: [deck.trend, newTrend],
      });
    }

    deck.usageRate = newUsage;
    deck.tier = newTier;
    deck.trend = newTrend;
    if (stats.power != null) deck.power = stats.power;
  }

  // --- トレンド系列を1週進める（12週ローリング）
  if (data.trend && Array.isArray(data.trend.weeks)) {
    const weeks = data.trend.weeks;
    if (weeks.length >= 12) weeks.shift();
    weeks.push(today());

    for (const deckKey of Object.keys(data.trend.series || {})) {
      const series = data.trend.series[deckKey];
      const deck = data.decks.find(d => d.id === deckKey);
      if (!deck) continue;
      if (series.length >= 12) series.shift();
      series.push(deck.usageRate);
    }
  }

  // --- メタデータ更新
  data.lastUpdated = today();
  if (banlistArr[0]) {
    data.banlistDate = banlistArr[0].date?.slice(0, 10);
  }
  if (setArr[0]) {
    data.latestSet = { name: setArr[0].name, release: setArr[0].release?.slice(0, 10) };
  }

  // --- 結果出力
  console.log('');
  console.log('=== Changes ===');
  if (changes.length === 0) {
    console.log('  (no deck-level changes)');
  } else {
    for (const c of changes) {
      const arr = (a, b) => a === b ? String(a) : `${a} → ${b}`;
      console.log(`  ${c.nameJa.padEnd(10)} usage=${arr(c.usage[0], c.usage[1])} tier=${arr(c.tier[0], c.tier[1])} trend=${arr(c.trend[0], c.trend[1])}`);
    }
  }

  if (unknownMdm.length) {
    console.log('');
    console.log('=== Unmapped MDM decks (consider adding to deck-name-map.json) ===');
    unknownMdm.forEach(n => console.log('  •', n));
  }

  if (!DRY) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log('\n✅ data.json written');
  } else {
    console.log('\n(dry-run: data.json NOT written)');
  }
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
