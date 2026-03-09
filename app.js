const BASE = 0.008;
const BASE_TOKEN = 0.008 * 2000 + 0.08 * 200 + 0.912 * 20;
const PLAN1_MAX = 120;
const DOUBLE_SIX_BEST_COUNTER = 25;
let selectedShortcutStop = null;

function p6(counter) {
  if (counter < 65) return BASE;
  return Math.min(1, BASE + 0.05 * (counter - 64));
}

function fmtPct(x) {
  return `${(x * 100).toFixed(2)}%`;
}

function fmtNum(x, d = 2) {
  return Number(x).toFixed(d);
}

function fmtW(x) {
  return `${fmtNum(x, 2)}`;
}

function countKey(c, k, u) {
  return `${c}|${k}|${u ? 1 : 0}`;
}

function parseCountKey(key) {
  const [c, k, u] = key.split('|').map(Number);
  return { c, k, u: !!u };
}

const frozenFree10Cache = new Map();
function frozenFree10Dist(q) {
  const cacheKey = q.toFixed(6);
  if (frozenFree10Cache.has(cacheKey)) return frozenFree10Cache.get(cacheKey);
  let dp = new Map([[`0|0`, 1]]);
  for (let i = 0; i < 10; i++) {
    const next = new Map();
    for (const [key, pr] of dp.entries()) {
      const [kStr, upStr] = key.split('|');
      const k = Number(kStr);
      const up = Number(upStr);
      const add = (kk, uu, p) => {
        const nk = Math.min(4, kk);
        const nkKey = `${nk}|${uu ? 1 : 0}`;
        next.set(nkKey, (next.get(nkKey) || 0) + pr * p);
      };
      add(k, up, 1 - q);
      add(k + 1, up, q * 0.5);
      add(k + 1, 1, q * 0.5);
    }
    dp = next;
  }
  frozenFree10Cache.set(cacheKey, dp);
  return dp;
}

function evolveSkip(n) {
  let dist = new Map([[countKey(0, 0, false), 1]]);
  let expectedTokens = 0;

  for (let draw = 1; draw <= n; draw++) {
    const next = new Map();
    for (const [key, pr] of dist.entries()) {
      const { c, k, u } = parseCountKey(key);
      if (draw === 120 && !u) {
        expectedTokens += pr * 2000;
        const nk = Math.min(4, k + 1);
        const nkey = countKey(0, nk, true);
        next.set(nkey, (next.get(nkey) || 0) + pr);
        continue;
      }
      const q = p6(c);
      expectedTokens += pr * (q * 2000 + 0.08 * 200 + (0.92 - q) * 20);
      const nk = Math.min(4, k + 1);
      const keyUp = countKey(0, nk, true);
      const keyOff = countKey(0, nk, u);
      const keyMiss = countKey(c + 1, k, u);
      next.set(keyUp, (next.get(keyUp) || 0) + pr * q * 0.5);
      next.set(keyOff, (next.get(keyOff) || 0) + pr * q * 0.5);
      next.set(keyMiss, (next.get(keyMiss) || 0) + pr * (1 - q));
    }
    dist = next;

    if (draw === 30) {
      const frozen = new Map();
      for (const [key, pr] of dist.entries()) {
        const { c, k, u } = parseCountKey(key);
        const q = p6(c);
        expectedTokens += pr * 10 * (q * 2000 + 0.08 * 200 + (0.92 - q) * 20);
        const freeDist = frozenFree10Dist(q);
        for (const [fKey, fPr] of freeDist.entries()) {
          const [fkStr, fuStr] = fKey.split('|');
          const fk = Number(fkStr);
          const fu = !!Number(fuStr);
          const nk = Math.min(4, k + fk);
          const nkey = countKey(c, nk, u || fu);
          frozen.set(nkey, (frozen.get(nkey) || 0) + pr * fPr);
        }
      }
      dist = frozen;
    }
  }

  let pUp = 0;
  let pOne = 0;
  let pTwo = 0;
  let pThree = 0;
  let expectedCounter = 0;

  for (const [key, pr] of dist.entries()) {
    const { c, k, u } = parseCountKey(key);
    if (u) pUp += pr;
    if (k === 1) pOne += pr;
    if (k === 2) pTwo += pr;
    if (k === 3) pThree += pr;
    expectedCounter += c * pr;
  }

  return { n, pUp, pOne, pTwo, pThree, expectedTokens, expectedCounter };
}

function additionalPlan(hitPull, totalStop) {
  const extra = Math.max(0, totalStop - hitPull);
  let dist = new Map([[0, 1]]);
  let expectedTokens = 0;

  for (let i = 0; i < extra; i++) {
    const next = new Map();
    for (const [c, pr] of dist.entries()) {
      const q = p6(c);
      expectedTokens += pr * (q * 2000 + 0.08 * 200 + (0.92 - q) * 20);
      next.set(0, (next.get(0) || 0) + pr * q);
      next.set(c + 1, (next.get(c + 1) || 0) + pr * (1 - q));
    }
    dist = next;
  }

  if (totalStop >= 30 && hitPull < 30) expectedTokens += 10 * BASE_TOKEN;
  const pExtra6 = 1 - (dist.get(extra) || 0);
  const freeNext = totalStop >= 60 ? 10 : 0;

  const memoEv = new Map();
  function evPaidToUp(countedDone, counter, freeLeft) {
    const key = `${countedDone}|${counter}|${freeLeft}`;
    if (memoEv.has(key)) return memoEv.get(key);
    if (countedDone >= 120) return 0;
    const nextCount = countedDone + 1;
    const cost = freeLeft > 0 ? 0 : 1;
    if (nextCount === 120) return cost;
    const q = p6(counter);
    const nextFree = Math.max(0, freeLeft - 1);
    const v = q * 0.5 * cost + q * 0.5 * (cost + evPaidToUp(nextCount, 0, nextFree)) + (1 - q) * (cost + evPaidToUp(nextCount, counter + 1, nextFree));
    memoEv.set(key, v);
    return v;
  }

  let expectedPaidNext = 0;
  for (const [c, pr] of dist.entries()) expectedPaidNext += pr * evPaidToUp(0, c, freeNext);

  return {
    totalStop,
    needMore: extra,
    pExtra6,
    expectedTokens,
    expectedPaidNext,
    totalFutureSpend: extra + expectedPaidNext,
  };
}

function doubleSixProb(startCounter) {
  const memo = new Map();
  function f(pos, counter, seenOff) {
    const key = `${pos}|${counter}|${seenOff ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);
    if (pos === 120) return seenOff ? 1 : 0;
    const q = p6(counter);
    const seenNext = seenOff || (pos >= 111 && pos <= 119);
    const v = q * 0.5 * f(pos + 1, 0, seenNext) + (1 - q) * f(pos + 1, counter + 1, seenOff);
    memo.set(key, v);
    return v;
  }
  return f(1, startCounter, false);
}

const plan1Data = Array.from({ length: PLAN1_MAX + 1 }, (_, n) => evolveSkip(n));

function renderPlan1() {
  const range = document.getElementById('plan1Range');
  const num = document.getElementById('plan1Number');
  const n = Math.max(0, Math.min(PLAN1_MAX, Number(num.value) || 0));
  range.value = n;
  num.value = n;
  const row = plan1Data[n];
  const cards = document.getElementById('plan1Cards');
  cards.innerHTML = [
    ['出 Up 概率', fmtPct(row.pUp)],
    ['出 1 个 6 星', fmtPct(row.pOne)],
    ['出 2 个 6 星', fmtPct(row.pTwo)],
    ['出 3 个 6 星', fmtPct(row.pThree)],
    ['期望武库配额', fmtW(row.expectedTokens)],
    ['平均继承层数', fmtNum(row.expectedCounter)],
  ].map(([label, value]) => `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`).join('');

  const checkpoints = plan1Data.filter(r => r.n % 10 === 0);
  const tbody = document.querySelector('#plan1Table tbody');
  tbody.innerHTML = checkpoints.map(r => `
    <tr class="${r.n === n ? 'highlight' : ''}">
      <td>${r.n}</td>
      <td>${fmtPct(r.pUp)}</td>
      <td>${fmtPct(r.pOne)}</td>
      <td>${fmtPct(r.pTwo)}</td>
      <td>${fmtPct(r.pThree)}</td>
      <td>${fmtW(r.expectedTokens)}</td>
      <td>${fmtNum(r.expectedCounter)}</td>
    </tr>`).join('');
}

function getCandidateStops(hit) {
  const candidates = [hit, 30, 60, 80, 90, 120].filter((v, i, arr) => v >= hit && arr.indexOf(v) === i);
  return candidates.sort((a, b) => a - b);
}

function renderAfterUp() {
  const input = document.getElementById('hitPull');
  let hit = Math.max(1, Math.min(120, Number(input.value) || 1));
  input.value = hit;
  const candidates = getCandidateStops(hit);
  const rows = candidates.map(stop => additionalPlan(hit, stop));
  const best = rows.reduce((a, b) => a.totalFutureSpend <= b.totalFutureSpend ? a : b);

  if (!selectedShortcutStop || !candidates.includes(selectedShortcutStop)) selectedShortcutStop = candidates[0];

  const advice = document.getElementById('afterUpAdvice');
  advice.innerHTML = best.totalStop === hit
    ? `<span class="pill">推荐</span> 你在第 ${hit} 抽已经出了当期 Up，当前最省总投入的方案通常是直接停手。`
    : `<span class="pill">推荐</span> 从当前输入来看，建议补到 ${best.totalStop} 抽后停手。`;

  const shortcutRow = document.getElementById('shortcutRow');
  shortcutRow.innerHTML = rows.map(r => `
    <button class="shortcut-btn ${r.totalStop === selectedShortcutStop ? 'active' : ''}" data-stop="${r.totalStop}">
      补到 ${r.totalStop}${r.totalStop === hit ? '（停手）' : `（+${r.needMore}）`}
    </button>`).join('');

  shortcutRow.querySelectorAll('.shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedShortcutStop = Number(btn.dataset.stop);
      renderAfterUp();
    });
  });

  const picked = rows.find(r => r.totalStop === selectedShortcutStop) || rows[0];
  const summary = document.getElementById('shortcutSummary');
  summary.innerHTML = `<span class="pill">快捷结果</span> 选择补到 ${picked.totalStop} 抽后：还需补 ${picked.needMore} 抽，当前池再出额外 6 星概率为 ${fmtPct(picked.pExtra6)}，这段补抽期望武器配额为 ${fmtW(picked.expectedTokens)}，下池拿 Up 的期望付费抽数为 ${fmtNum(picked.expectedPaidNext)}，合计未来投入约 ${fmtNum(picked.totalFutureSpend)} 抽。`;

  const tbody = document.querySelector('#afterUpTable tbody');
  tbody.innerHTML = rows.map(r => `
    <tr class="${r.totalStop === selectedShortcutStop ? 'highlight' : ''}">
      <td>${r.totalStop}</td>
      <td>${r.needMore}</td>
      <td>${fmtPct(r.pExtra6)}</td>
      <td>${fmtW(r.expectedTokens)}</td>
      <td>${fmtNum(r.expectedPaidNext)}</td>
      <td>${fmtNum(r.totalFutureSpend)}</td>
    </tr>`).join('');
}

function renderDoubleSix() {
  const range = document.getElementById('doubleCounter');
  const num = document.getElementById('doubleCounterNumber');
  const c = Math.max(0, Math.min(64, Number(num.value) || 0));
  range.value = c;
  num.value = c;
  const p = doubleSixProb(c);
  const best = doubleSixProb(DOUBLE_SIX_BEST_COUNTER);
  const output = document.getElementById('doubleSixOutput');
  output.innerHTML = [
    ['当前起手层数', `${c} 层`],
    ['双 6 星成功率', fmtPct(p)],
    ['最佳层数', `${DOUBLE_SIX_BEST_COUNTER} 层`],
    ['最佳成功率', fmtPct(best)],
  ].map(([label, value]) => `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`).join('');
}

function bindPair(rangeId, numId, render) {
  const range = document.getElementById(rangeId);
  const num = document.getElementById(numId);
  range.addEventListener('input', () => { num.value = range.value; render(); });
  num.addEventListener('input', () => { range.value = num.value; render(); });
}

document.getElementById('hitPull').addEventListener('input', () => {
  selectedShortcutStop = null;
  renderAfterUp();
});
bindPair('plan1Range', 'plan1Number', renderPlan1);
bindPair('doubleCounter', 'doubleCounterNumber', renderDoubleSix);
renderPlan1();
renderAfterUp();
renderDoubleSix();
