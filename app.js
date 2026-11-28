// Copyright (c) 2026 pokiwo22. All rights reserved. 無断転載・複製・商用利用禁止(LICENSE参照)
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));

let urlTimer, refs = new Set(), paceOff = new Set(), rkMode = "final", paceMode = "final", paceTimer = 0;
let indOn = new Set(), avgOff = new Set(), pace = null, paceAuto = true;
let idx, club, league = "J1", sheetLeague = "J1", picked = [], round = 1, metric = "points", activeTab = "trend", locked = false;
let S = [], charts = {}, latestThrough = 0;
const files = {};

// クラブカラー [メイン, サブ]。色名はWikipedia(チームカラー欄)に基づく。色コードはユニフォーム定義があるものはそれ、無いものは近似値(公式の指定コードではない)
const CLUB_COLOR = {
  akita: ["#0044FF", "#6EC1E4"], chiba: ["#FFE100", "#00A040"], cosaka: ["#FA1A82", "#002060"], ehime: ["#ED6F23", "#F7AE23"],
  ftokyo: ["#0A3C8C", "#D4002A"], fujieda: ["#8689C3", "#00A040"], fukuoka: ["#0B1E4B", "#939393"], gosaka: ["#0068B7", "#000000"],
  hiroshima: ["#512D8E"], iwaki: ["#D3042C", "#00508F"], iwata: ["#5BA8DC"], kanazawa: ["#D7000F", "#000000"], kashima: ["#A5001E"],
  kashiwa: ["#FFE100", "#000000"], kawasakif: ["#00A5E3", "#000000"], kitakyushu: ["#FFE100", "#E60012"], kobe: ["#B5002D"],
  kofu: ["#0054A6"], kumamoto: ["#E60012", "#000000"], kusatsu: ["#0A1F5C", "#FFD500"], kyoto: ["#5B2A86"], machida: ["#003DA5"],
  matsumoto: ["#006E3A"], mito: ["#0B3A8C"], nagasaki: ["#0068B7", "#F39800"], nagoya: ["#E60012", "#FFD700"], niigata: ["#F7931E", "#0B3A8C"],
  oita: ["#0068B7", "#FFE100"], okayama: ["#9B1B30", "#0B1F4B"], omiya: ["#0B1F4B", "#F7931E"], ryukyu: ["#B7282E"],
  sagamihara: ["#00A04B", "#000000"], sapporo: ["#E60012", "#000000"], sendai: ["#E5B800", "#00479D"], shimizu: ["#FF8800", "#003A78"],
  shonan: ["#6FB92E", "#0068B7"], tochigi: ["#FFE100", "#0068B7"], tochigic: ["#010A43", "#D43184"], tokushima: ["#1D2F6F", "#00A04B"],
  tokyov: ["#00A040", "#D9A400"], tosu: ["#0068B7", "#E8528C"], toyama: ["#0068B7"], urawa: ["#E60012", "#000000"],
  yamagata: ["#1D4F9F"], yamaguchi: ["#F39800"], yokohamafc: ["#00A0E9", "#0068B7"], yokohamafm: ["#0033A0", "#E60012"],
  "今治": ["#0068B7", "#FFE100"], "八戸": ["#00A040"], "宮崎": ["#E8528C"], "岩手": ["#E60012", "#000000"], "鹿児島": ["#0B1F4B"],
};

const isDarkMode = () => matchMedia("(prefers-color-scheme: dark)").matches;

// 文字色: 背景とのコントラストを確保（ライト/ダーク両対応）
function textColor(cc, dark = isDarkMode()) {
  const lum = c => {
    const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
      .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const chroma = c => {
    const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return Math.max(...v) - Math.min(...v);
  };
  if (dark) {
    const bgLum = 0.015;
    const ratioD = c => (lum(c) + 0.05) / (bgLum + 0.05);
    const lighten = c => {
      let x = c;
      for (let k = 0; k < 14 && ratioD(x) < 5.5; k++) {
        x = "#" + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(x.slice(i, i + 2), 16) + (255 - parseInt(x.slice(i, i + 2), 16)) * 0.22)).toString(16).padStart(2, "0")).join("");
      }
      return x;
    };
    const pick = ratioD(cc[0]) >= 3.5 || !cc[1] || chroma(cc[1]) < 40 ? cc[0] : cc[1];
    return lighten(pick);
  }
  const ratioL = c => 1.05 / (lum(c) + 0.05);
  const darken = c => {
    let x = c;
    for (let k = 0; k < 12 && ratioL(x) < 4.8; k++) {
      x = "#" + [1, 3, 5].map(i => Math.round(parseInt(x.slice(i, i + 2), 16) * 0.88).toString(16).padStart(2, "0")).join("");
    }
    return x;
  };
  const pick = ratioL(cc[0]) >= 3 || !cc[1] || ratioL(cc[1]) < 3 || chroma(cc[1]) < 40 ? cc[0] : cc[1];
  return darken(pick);
}

const load = (key, lg) => files[key + lg] ??= fetch(`data/${key}_${lg}.json?v=${encodeURIComponent(idx.updated)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
const latest = id => idx.seasons.find(s => s.leagues.J1?.includes(id) || s.leagues.J2?.includes(id));
const leagueOf = (s, id) => (s?.leagues.J1?.includes(id) ? "J1" : s?.leagues.J2?.includes(id) ? "J2" : null);

async function init() {
  idx = await fetch("data/index.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null);
  if (!idx || !idx.seasons.length) {
    $("#cards").className = "cards is-empty";
    $("#cards").innerHTML = `<div class="empty-card">データがありません。</div>`;
    return;
  }

  // 更新時刻と次回自動更新時刻（JST）
  $("#updated").textContent = new Date(idx.updated).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  {
    const slots = dow => (dow === 0 || dow === 6 ? Array.from({ length: 14 }, (_, i) => [7 + (i >> 1), (i & 1) * 30]) : [[11, 30], [12, 30], [13, 30]]);
    const now = Date.now();
    let next = null;
    for (let d = 0; d < 8 && !next; d++) {
      const day = new Date(now + d * 864e5);
      for (const [h, m] of slots(day.getUTCDay())) {
        const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
        if (t > now) { next = t; break; }
      }
    }
    $("#nextUpd").textContent = new Date(next).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  // URLパラメータ復元
  const q = new URLSearchParams(location.search);
  const qClub = q.get("club");
  const hasValidClub = qClub && idx.teams[qClub];
  picked = q.get("seasons") ? q.get("seasons").split(",").filter(Boolean) : idx.seasons.slice(0, 2).map(s => s.key);
  round = +q.get("round") || 0;
  metric = ["points", "gd", "gf", "ga"].includes(q.get("m")) ? q.get("m") : "points";
  paceAuto = !q.has("ind") && !(q.has("ref") && q.get("ref"));
  if (q.has("ref")) refs = new Set(q.get("ref").split(",").filter(k => "tumd".includes(k) && k));
  indOn = new Set((q.get("ind") || "").split(",").filter(Boolean));
  avgOff = new Set((q.get("avgoff") || "").split(",").filter(Boolean));
  rkMode = q.get("rk") === "at" ? "at" : "final";
  paceMode = q.get("pm") === "at" ? "at" : "final";

  if (hasValidClub) {
    club = qClub;
    league = leagueOf(latest(club), club) || "J1";
  } else {
    league = "J1";
    const sorted = await getSortedClubIds("J1");
    club = sorted[0] || idx.seasons[0].leagues.J1[0];
  }
  sheetLeague = league;

  bindEvents();
  syncSegUI();
  await refresh();
}

function bindEvents() {
  // クラブ選択シート開閉
  $("#clubTrigger").onclick = () => openSheet();
  $("#sheetClose").onclick = () => closeSheet();
  $("#clubSheet").onclick = e => { if (e.target === $("#clubSheet")) closeSheet(); };

  // リーグ切替（シート内）
  $$("#leagueSeg .seg-btn").forEach(btn => {
    btn.onclick = async () => {
      sheetLeague = btn.dataset.league;
      syncLeagueSeg();
      await renderClubSheet();
    };
  });

  // 分析タブ切替
  $$(".vtab").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // 累積指標切替
  $$("#metricSeg .seg-btn").forEach(btn => {
    btn.onclick = () => {
      metric = btn.dataset.metric;
      syncSegUI();
      draw();
      setRound(round);
    };
  });

  // 対戦相手の順位基準切替
  $$("#zoomCtl .seg-btn").forEach(btn => {
    btn.onclick = () => {
      rkMode = btn.dataset.zrk;
      syncSegUI();
      renderMatchDetail();
      renderStrips();
      setRound(round);
    };
  });

  // ペース比較の分け方切替
  $$("#paceMode .seg-btn").forEach(btn => {
    btn.onclick = () => {
      paceAuto = false;
      paceMode = btn.dataset.pm;
      syncSegUI();
      renderRefs();
      drawPace();
      setRound(round);
    };
  });

  // 下部タイムライン操作
  $("#padLock").onclick = () => {
    locked = !locked;
    syncLockUI();
  };
  $("#prevRound").onclick = () => {
    if (locked) return flashLock();
    setRound(round - 1);
  };
  $("#nextRound").onclick = () => {
    if (locked) return flashLock();
    setRound(round + 1);
  };
  $("#latestRound").onclick = () => {
    if (locked) return flashLock();
    if (latestThrough) setRound(latestThrough);
  };
  $("#round").oninput = e => {
    if (locked) { e.target.value = round; return flashLock(); }
    setRound(+e.target.value);
  };

  // キーボード操作
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#clubSheet").hidden) { closeSheet(); return; }
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (!$("#clubSheet").hidden) return;
    if (e.key === "ArrowLeft") {
      if (locked) return flashLock();
      e.preventDefault();
      setRound(round - 1);
    } else if (e.key === "ArrowRight") {
      if (locked) return flashLock();
      e.preventDefault();
      setRound(round + 1);
    }
  });

  // カラースキーム変更時に色・グラフ再描画
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyClubHeader();
    draw();
  });
}

function syncSegUI() {
  $$("#metricSeg .seg-btn").forEach(b => {
    const on = b.dataset.metric === metric;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on);
  });
  $$("#zoomCtl .seg-btn").forEach(b => {
    const on = b.dataset.zrk === rkMode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on);
  });
  $$("#paceMode .seg-btn").forEach(b => {
    const on = b.dataset.pm === paceMode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on);
  });
}

function syncLeagueSeg() {
  $$("#leagueSeg .seg-btn").forEach(b => {
    const on = b.dataset.league === sheetLeague;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on);
  });
}

function syncLockUI() {
  const lockBtn = $("#padLock");
  lockBtn.classList.toggle("on", locked);
  lockBtn.setAttribute("aria-pressed", locked);
  lockBtn.setAttribute("aria-label", locked ? "節の移動ロックを解除" : "節の移動をロック");
  $("#round").disabled = locked;
  syncTimelineButtons();
}

function flashLock() {
  const b = $("#padLock");
  b.classList.add("is-flash");
  setTimeout(() => b.classList.remove("is-flash"), 280);
}

function switchTab(tab) {
  activeTab = tab;
  $$(".vtab").forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on);
  });
  $$(".tab-panel").forEach(p => {
    p.hidden = p.id !== `panel-${tab}`;
  });
  if (tab === "trend") {
    requestAnimationFrame(() => { charts.chPts?.resize(); if (charts.chPts) moveCursor(charts.chPts); });
  } else if (tab === "pace") {
    requestAnimationFrame(() => drawPace());
  }
}

async function getSortedClubIds(lg) {
  const cur = idx.seasons[0], d = await load(cur.key, lg);
  const rk = d?.teams ? rankMap({ all: d.teams, rk: {} }, Math.max(1, d.through || 1)) : {};
  return Object.keys(idx.teams)
    .filter(id => leagueOf(latest(id), id) === lg)
    .sort((a, b) => (rk[a] ?? 99) - (rk[b] ?? 99) || idx.teams[a].localeCompare(idx.teams[b], "ja"));
}

async function openSheet() {
  sheetLeague = league;
  syncLeagueSeg();
  $("#clubSheet").hidden = false;
  $("#clubTrigger").setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  await renderClubSheet();
}

function closeSheet() {
  $("#clubSheet").hidden = true;
  $("#clubTrigger").setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

async function renderClubSheet() {
  const cur = idx.seasons[0], d = await load(cur.key, sheetLeague);
  const rk = d?.teams ? rankMap({ all: d.teams, rk: {} }, Math.max(1, d.through || 1)) : {};
  const ids = await getSortedClubIds(sheetLeague);
  const th = Math.max(1, d?.through || 1);

  $("#clubList").innerHTML = ids.map(id => {
    const cc = CLUB_COLOR[id];
    const c1 = cc ? cc[0] : "var(--line-strong)";
    const c2 = cc ? (cc[1] || cc[0]) : "var(--line-strong)";
    const pts = d?.teams?.[id]?.byRound?.[th - 1]?.points;
    const sel = id === club;
    return `<button type="button" class="club-opt${sel ? " is-selected" : ""}" data-id="${esc(id)}">
      <span class="club-opt-bar" aria-hidden="true"><i style="background:${c1}"></i><i style="background:${c2}"></i></span>
      <span class="club-opt-rk">${rk[id] ? `${rk[id]}位` : "—"}</span>
      <span class="club-opt-name">${esc(idx.teams[id])}</span>
      ${pts != null ? `<span class="club-opt-pts">${pts}pt</span>` : ""}
    </button>`;
  }).join("");

  $$("#clubList .club-opt").forEach(btn => {
    btn.onclick = async () => {
      club = btn.dataset.id;
      league = sheetLeague;
      closeSheet();
      await refresh();
    };
  });
}

async function applyClubHeader() {
  const cur = idx.seasons[0];
  const curLg = leagueOf(cur, club) || league;
  const d = await load(cur.key, curLg);
  const rk = d?.teams ? rankMap({ all: d.teams, rk: {} }, Math.max(1, d.through || 1))[club] : null;
  const cc = CLUB_COLOR[club];
  const root = document.documentElement.style;
  root.setProperty("--club", cc ? cc[0] : "var(--accent)");
  root.setProperty("--club2", cc ? (cc[1] || cc[0]) : "var(--accent)");
  root.setProperty("--clubt", cc ? textColor(cc) : "var(--fg)");

  $("#clubName").textContent = idx.teams[club] || club;
  $("#clubLg").textContent = curLg;
  $("#clubRank").textContent = rk ? `${rk}位` : "";
}

async function refresh() {
  await applyClubHeader();

  // 選択中シーズンの色マップを構築
  const activeKeys = idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club)).map(s => s.key);
  const box = $("#seasons");
  box.innerHTML = idx.seasons.map(s => {
    const lg = leagueOf(s, club);
    const onIdx = activeKeys.indexOf(s.key);
    const isOn = Boolean(lg && onIdx >= 0);
    const sc = isOn ? `var(--c${onIdx % 6})` : "var(--line-strong)";
    return `<button type="button" class="s-chip${isOn ? " is-on" : ""}" style="--sc:${sc}" data-key="${esc(s.key)}" ${lg ? "" : "disabled"} aria-pressed="${isOn}">
      <span class="s-dot" aria-hidden="true"></span>
      <span>${esc(s.label.replace(/^20/, ""))}</span>
      <small>${lg ? esc(lg) : "不在"}</small>
    </button>`;
  }).join("");

  $$("#seasons .s-chip:not(:disabled)").forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.key;
      if (picked.includes(k)) picked = picked.filter(x => x !== k);
      else picked = idx.seasons.map(s => s.key).filter(x => x === k || picked.includes(x));
      refresh();
    };
  });

  const keys = idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club));
  S = (await Promise.all(keys.map(async s => {
    const lg = leagueOf(s, club), d = await load(s.key, lg), t = d?.teams[club];
    return t && { key: s.key, label: s.label, lg, rounds: d.rounds, through: d.through, by: t.byRound, all: d.teams, mgr: t.mgr || [], matches: t.matches || [] };
  }))).filter(Boolean);

  const curSeason = S.find(s => s.key === idx.seasons[0].key);
  latestThrough = curSeason ? curSeason.through : 0;

  const max = Math.max(1, ...S.map(s => s.rounds), 38);
  const actualMax = S.length ? Math.max(1, ...S.map(s => s.rounds)) : max;
  $("#round").max = actualMax;
  $("#roundMax").textContent = `/${actualMax}`;

  if (!round) round = Math.max(1, latestThrough || (S[0]?.through ?? 1));
  await loadPace();
  setRound(round);
  draw();
  mgrLegend();
  renderStrips();
  renderMatchDetail();
  renderTier();
}

// 監督: mgr=[{r:その監督の最初の節,n:名前}]
const PAL = ["#facc15", "#ffffff", "#0f172a", "#f97316"];
const mgrIdx = (s, r) => s.mgr.reduce((k, m, j) => (m.r <= r ? j : k), 0);
const mgrColor = (s, i, k) => (k === 0 ? css(`--c${i % 6}`) : PAL[(k - 1) % PAL.length]);
const short = n => (n.includes("・") ? n.split("・").pop() : n);

const at = (s, r) => (r <= s.through ? s.by[r - 1] : null);

const rank = (s, r) => {
  const m = at(s, r);
  if (!m) return null;
  const L = Object.values(s.all).map(t => t.byRound[r - 1]);
  const better = b => b.points > m.points || (b.points === m.points && (b.gd > m.gd || (b.gd === m.gd && b.gf > m.gf)));
  return { n: L.filter(better).length + 1, of: L.length };
};

function syncTimelineButtons() {
  const max = +$("#round").max || 38;
  const pct = max > 1 ? ((round - 1) / (max - 1)) * 100 : 0;
  $("#round").style.setProperty("--pct", `${pct}%`);
  $("#prevRound").disabled = locked || round <= 1;
  $("#nextRound").disabled = locked || round >= max;
  const latestBtn = $("#latestRound");
  if (latestThrough && latestThrough !== round) {
    latestBtn.hidden = false;
    latestBtn.disabled = locked;
    latestBtn.textContent = `最新(${latestThrough}節)`;
  } else {
    latestBtn.hidden = true;
  }
}

function setRound(r) {
  const prev = round;
  const max = +$("#round").max || 38;
  round = Math.min(max, Math.max(1, r));
  if (round !== prev && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
  $("#round").value = round;
  $("#roundOut").textContent = round;
  syncTimelineButtons();

  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const params = {
      club,
      seasons: picked.join(","),
      round,
      m: metric,
      ...(paceAuto ? {} : {
        ref: [...refs].join(","),
        ...(indOn.size ? { ind: [...indOn].join(",") } : {}),
        ...(avgOff.size ? { avgoff: [...avgOff].join(",") } : {}),
        ...(paceMode === "at" ? { pm: "at" } : {}),
      }),
      ...(rkMode === "at" ? { rk: "at" } : {}),
    };
    history.replaceState(null, "", "?" + new URLSearchParams(params));
  }, 250);

  cards();
  if ($("#pmN")) $("#pmN").textContent = round;
  if (paceMode === "at" && activeTab === "pace") {
    clearTimeout(paceTimer);
    paceTimer = setTimeout(() => { renderRefs(); drawPace(); }, 140);
  }
  Object.values(charts).forEach(moveCursor);
  renderMatchDetail();
  dimStrips();
  renderTier();
}

function cards() {
  const wrap = $("#cards");
  if (!S.length) {
    wrap.className = "cards is-empty";
    wrap.innerHTML = `<div class="empty-card">上の「比較」からシーズンを1つ以上選択してください。</div>`;
    return;
  }
  wrap.className = S.length === 1 ? "cards is-single" : "cards";
  const name = k => (k === idx.seasons[0].key ? "今季" : k === idx.seasons[1]?.key ? "昨季" : null);

  wrap.innerHTML = S.map((s, i) => {
    const b = at(s, round), c = `var(--c${i % 6})`;
    const k = mgrIdx(s, round), mg = s.mgr[k];
    const rel = name(s.key);
    const head = `<div class="card-top">
      <span class="card-season">${esc(s.label)}<span class="card-tag">${esc(s.lg)}</span>${rel ? `<span class="card-tag${rel === "今季" ? " is-now" : ""}">${rel}</span>` : ""}</span>
      ${mg ? `<span class="mgr-badge" title="${esc(mg.n)}"><i class="dot" style="background:${mgrColor(s, i, k)}"></i>${esc(short(mg.n))}</span>` : ""}
    </div>`;

    if (!b) {
      return `<div class="card" style="--c:${c}">${head}<div class="card-kpi"><span class="kpi-pts"><b>—</b></span></div><div class="card-sub">未消化の節</div></div>`;
    }
    const rk = rank(s, round);
    const diffs = i === 0 ? S.slice(1).map(o => {
      const x = at(o, round);
      if (!x) return "";
      const dp = b.points - x.points, dg = b.gd - x.gd;
      return `<span class="diff-pill">${esc(name(o.key) || o.label)}比 勝点<b class="${cls(dp)}">${signed(dp)}</b> 得失<b class="${cls(dg)}">${signed(dg)}</b></span>`;
    }).join("") : "";

    return `<div class="card" style="--c:${c}">
      ${head}
      <div class="card-kpi">
        <span class="kpi-pts"><b>${b.points}</b><span>勝点</span></span>
        ${rk ? `<span class="kpi-rank">${rk.n}位<small>/${rk.of}</small></span>` : ""}
      </div>
      <div class="card-sub">
        <span>得失 <b class="${cls(b.gd)}">${signed(b.gd)}</b> (${b.gf}-${b.ga})</span>
        <span>${b.w}勝${b.d}分${b.l}敗</span>
      </div>
      ${b.pending ? `<div class="card-pending">延期あり（${b.pending}試合後日消化）</div>` : ""}
      ${diffs ? `<div class="card-diffs">${diffs}</div>` : ""}
    </div>`;
  }).join("");
}

function moveCursor(ch) {
  if (!ch || !ch.chartArea) return;
  if (!ch.cur) {
    ch.cur = document.createElement("div");
    ch.cur.className = "cur";
    ch.cur.innerHTML = `<span class="cur-tag"></span>`;
    ch.canvas.parentNode.append(ch.cur);
  }
  const { top, bottom, left, right } = ch.chartArea;
  const x = ch.scales.x.getPixelForValue(round - 1);
  if (!Number.isFinite(x)) return;
  ch.cur.style.top = top + "px";
  ch.cur.style.height = Math.max(0, bottom - top) + "px";
  ch.cur.style.transform = `translateX(${x}px)`;
  const tag = ch.cur.querySelector(".cur-tag");
  tag.textContent = `${round}節`;
  // 端で見切れないよう横位置を微調整
  const pad = 22;
  const shift = x - left < pad ? pad - (x - left) : right - x < pad ? -(pad - (right - x)) : 0;
  tag.style.transform = `translateX(calc(-50% + ${shift}px))`;
}
const cursor = { id: "cursor", afterLayout: moveCursor, afterDestroy: ch => ch.cur?.remove() };

const MIN_RANK_ROUND = 4;
const rankMap = (s, n) => {
  s.rk ??= {};
  return s.rk[n] ??= Object.fromEntries(
    Object.entries(s.all)
      .map(([id, t]) => [id, t.byRound[n - 1]])
      .sort((a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd || b[1].gf - a[1].gf)
      .map(([id], i) => [id, i + 1])
  );
};

function tierOf(r, n) { const k = Math.ceil(n / 3); return r <= 3 ? 0 : r <= k ? 1 : r > n - k ? 3 : 2; }

function renderTier() {
  const el = $("#tierBody");
  if (!el) return;
  const SS = S.filter(s => s.matches.length);
  if (!SS.length) {
    el.innerHTML = `<div class="empty-card">表示できる試合データがありません。</div>`;
    return;
  }
  const NAME = ["トップ3", "上位", "中位", "下位"];
  el.innerHTML = SS.map(s => {
    const si = S.indexOf(s);
    const n = Object.keys(s.all).length, k = Math.ceil(n / 3), rk = rankMap(s, s.through);
    const T = [0, 1, 2, 3].map(() => ({ w: 0, d: 0, l: 0 }));
    for (const [r, opp, , gf, ga] of s.matches) {
      if (r > round || gf == null) continue;
      T[tierOf(rk[opp], n)][gf > ga ? "w" : gf < ga ? "l" : "d"]++;
    }
    const g = t => t.w + t.d + t.l, pts = t => 3 * t.w + t.d, ppg = t => (g(t) ? pts(t) / g(t) : null);
    const sum = (...ts) => ({ w: ts.reduce((x, t) => x + t.w, 0), d: ts.reduce((x, t) => x + t.d, 0), l: ts.reduce((x, t) => x + t.l, 0) });
    const range = ["1〜3位", `4〜${k}位`, `${k + 1}〜${n - k}位`, `${n - k + 1}〜${n}位`];

    const cells = T.map((t, i) => `<div class="tcell">
      <div class="tl"><span>${NAME[i]}</span><small>${range[i]}</small></div>
      <div class="tbar">${g(t) ? `<i class="w" style="flex:${t.w}"></i><i class="d" style="flex:${t.d}"></i><i class="l" style="flex:${t.l}"></i>` : ""}</div>
      <div class="tstats">
        <span class="trecord">${t.w}勝${t.d}分${t.l}敗</span>
        <span class="tppg">${ppg(t) == null ? "—" : ppg(t).toFixed(2)}<small>勝点/試</small></span>
      </div>
    </div>`).join("");

    const U = sum(T[0], T[1]);
    let type = "試合数が少ないため、タイプは判定できません";
    if (g(U) >= 3 && g(T[3]) >= 3) {
      const pT = ppg(U), pL = ppg(T[3]), all = pts(sum(T[0], T[1], T[2], T[3])) / g(sum(T[0], T[1], T[2], T[3])), d = pL - pT;
      type = pT >= 1.4 && pL < pT - 0.3 ? "上位に強く、下位に取りこぼすタイプ"
        : all >= 1.7 ? "どの相手からも勝点を取れる、強いタイプ"
        : all <= 1.0 ? (pT <= 0.5 ? "全体に苦戦（特に上位からは、ほとんど取れていない）" : "全体に苦戦しているタイプ")
        : d >= 1.0 && pT <= 1.0 ? "下位からは取るが、上位には勝ちにくいタイプ"
        : Math.abs(d) <= 0.4 ? "相手を選ばず、満遍なく取るタイプ" : "標準的（上位より下位から多く取る）";
      if (g(T[0]) >= 3) type += ppg(T[0]) >= 1.4 ? "／トップ3にも強い" : ppg(T[0]) <= 0.5 ? "／トップ3からは、ほとんど取れていない" : "";
    }
    return `<div class="trow" style="--sc:var(--c${si % 6})">
      <div class="trow-head"><i class="s-bar"></i><b>${esc(s.label)}（${esc(s.lg)}）</b></div>
      <div class="ttype">${esc(type)}</div>
      <div class="tgrid">${cells}</div>
    </div>`;
  }).join("") + `<div class="note2">相手をそのシーズンの<b>最終順位</b>（今季は現時点）で4区分し、第${round}節までの成績を集計しています。タイプは上位（トップ3＋上位）と下位への勝点率による目安です。</div>`;
}

function mgrLegend() {
  const rows = S.filter(s => s.mgr.length > 1).map(s => {
    const i = S.indexOf(s);
    const items = s.mgr.map((m, k) => `<span class="mgr-item"><i class="dot" style="background:${mgrColor(s, i, k)}"></i>${esc(short(m.n))} ${m.r}節〜</span>`).join("");
    return `<div class="mgr-row"><b>${esc(s.label)}</b>${items}</div>`;
  });
  $("#mgrLegend").innerHTML = rows.length ? `<div class="mgr-legend-title">線の中心色＝監督交代</div>` + rows.join("") : "";
}

const scaleOpts = f => {
  const grid = css("--line"), fg = css("--muted"), bodyFg = css("--fg");
  const fontFam = `"Inter", "Noto Sans JP", system-ui, sans-serif`;
  return {
    animation: false,
    maintainAspectRatio: false,
    events: [], // 誤スクロール防止のためグラフ自体はタッチ非反応
    layout: { padding: { top: 4, right: 6, left: 0, bottom: 0 } },
    scales: {
      x: {
        title: { display: false },
        ticks: {
          color: fg,
          font: { family: fontFam, size: 11, weight: "600" },
          autoSkip: false,
          maxRotation: 0,
          callback(v) {
            const l = this.getLabelForValue(v);
            return l === 1 || l % 5 === 0 ? `${l}` : "";
          },
        },
        grid: { display: false },
        border: { color: grid },
      },
      y: {
        ticks: { color: fg, font: { family: fontFam, size: 11, weight: "600" } },
        grid: {
          color: c => (f === "gd" && c.tick.value === 0 ? css("--neg") : grid),
          lineWidth: c => (f === "gd" && c.tick.value === 0 ? 1.5 : 1),
        },
        border: { display: false },
      },
    },
    plugins: {
      legend: {
        onClick: () => {},
        align: "start",
        labels: {
          filter: it => it.text,
          color: bodyFg,
          usePointStyle: true,
          pointStyle: "line",
          boxWidth: 16,
          font: { family: fontFam, size: 11, weight: "700" },
          padding: 12,
        },
      },
      tooltip: { enabled: false },
    },
  };
};

function renderMatchDetail() {
  const el = $("#matchDetail");
  if (!el) return;
  const SS = S.filter(s => s.matches.length);
  if (!SS.length) { el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;

  const items = SS.map(s => {
    const si = S.indexOf(s);
    const m = s.matches.find(x => x[0] === round);
    if (!m) {
      return `<div class="md-item" style="--sc:var(--c${si % 6})"><span class="md-season"><i></i>${esc(s.label.replace(/^20/, ""))}</span><span class="md-res u">試合なし</span><span class="md-opp">この節は対象外</span></div>`;
    }
    const [r, opp, home, gf, ga] = m;
    const played = gf != null;
    const res = !played ? "u" : gf > ga ? "w" : gf < ga ? "l" : "d";
    const rk = rkMode === "final" ? rankMap(s, s.through)[opp] : played && r >= MIN_RANK_ROUND ? rankMap(s, r - 1)[opp] : null;
    const nm = s.all[opp]?.name ?? opp;
    const jp = { w: "勝", d: "分", l: "負", u: "未消化" }[res];
    const score = played ? `${jp} ${gf}-${ga}` : "未消化";
    const rkLabel = rk ? `${rkMode === "final" ? "最終" : "直前"}${rk}位` : (rkMode === "at" && r < MIN_RANK_ROUND ? "順位対象外" : "—");
    return `<div class="md-item" style="--sc:var(--c${si % 6})">
      <span class="md-season"><i></i>${esc(s.label.replace(/^20/, ""))}</span>
      <span class="md-res ${res}">${score}</span>
      <span class="md-opp">
        <span class="md-ha${home ? " is-h" : ""}">${home ? "H" : "A"}</span>
        <span class="md-name">vs ${esc(nm)}</span>
        <span class="md-rk">${esc(rkLabel)}</span>
      </span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="match-detail-head"><span>第${round}節の試合結果</span><span>下のマスをタップで節移動</span></div>${items}`;
}

function renderStrips() {
  const el = $("#strips");
  if (!el) return;
  const SS = S.filter(s => s.matches.length);
  if (!SS.length) {
    el.innerHTML = `<div class="empty-card">表示できる対戦記録がありません。</div>`;
    return;
  }

  el.innerHTML = SS.map(s => {
    const si = S.indexOf(s);
    const byRound = new Map(s.matches.map(m => [m[0], m]));
    const bandsCount = Math.ceil(s.rounds / 10);
    const rowsHtml = Array.from({ length: bandsCount }, (_, bi) => {
      const start = bi * 10 + 1;
      const end = Math.min(s.rounds, start + 9);
      const cells = [];
      for (let r = start; r <= end; r++) {
        const m = byRound.get(r);
        if (!m) { cells.push(`<span></span>`); continue; }
        const [, opp, home, gf, ga] = m;
        const played = gf != null;
        const res = !played ? "u" : gf > ga ? "w" : gf < ga ? "l" : "d";
        const rk = rkMode === "final" ? rankMap(s, s.through)[opp] : played && r >= MIN_RANK_ROUND ? rankMap(s, r - 1)[opp] : null;
        const nm = s.all[opp]?.name ?? opp;
        const jp = { w: "勝ち", d: "分け", l: "負け", u: "未消化" }[res];
        const title = `第${r}節 ${home ? "H" : "A"} vs ${nm} ${played ? `${gf}-${ga} ` : ""}${jp}${rk ? `（相手${rk}位）` : ""}`;
        cells.push(`<button type="button" class="sq ${res} ${home ? "h" : "a"}" data-r="${r}" title="${esc(title)}" aria-label="${esc(title)}">${rk ?? "—"}</button>`);
      }
      return `<div class="s-band"><span class="s-band-num">${start}</span>${cells.join("")}</div>`;
    }).join("");

    return `<div class="s-season" style="--sc:var(--c${si % 6})">
      <div class="s-season-head"><i class="s-bar"></i><span>${esc(s.label)}（${esc(s.lg)}）</span></div>
      <div class="s-rows">${rowsHtml}</div>
    </div>`;
  }).join("") + `<div class="note2">マス内の数字＝相手の${rkMode === "final" ? "<b>最終順位</b>（今季は現時点）" : "<b>試合直前の順位</b>（1〜3節は—）"} ／ 右下 H＝ホーム・A＝アウェイ ／ 1行10節区切り。マスをタップするとその節へ移動します。</div>`;

  $$("#strips .sq").forEach(btn => {
    btn.onclick = () => {
      if (locked) return flashLock();
      setRound(+btn.dataset.r);
    };
  });
  dimStrips();
}

function dimStrips() {
  $$("#strips .sq").forEach(e => {
    const r = +e.dataset.r;
    e.classList.toggle("dim", r > round);
    e.classList.toggle("now", r === round);
  });
}

function draw() {
  charts.chPts?.destroy();
  delete charts.chPts;
  if (!S.length) return;

  const max = Math.max(1, ...S.map(s => s.rounds));
  const labels = Array.from({ length: max }, (_, i) => i + 1);
  charts.chPts = new Chart($("#chPts"), {
    type: "line",
    plugins: [cursor],
    data: {
      labels,
      datasets: S.flatMap((s, i) => {
        const data = labels.map(r => at(s, r)?.[metric] ?? null);
        const col = css(`--c${i % 6}`);
        const l = `${s.label}（${s.lg}）`;
        const changeRounds = new Set(s.mgr.slice(1).map(m => m.r));
        const base = { data, pointHoverRadius: 0, tension: 0.1, borderCapStyle: "round", borderJoinStyle: "round" };
        return [
          {
            ...base,
            label: l,
            borderColor: col,
            backgroundColor: col,
            borderWidth: i === 0 ? 3.5 : 2.5,
            pointRadius: c => (changeRounds.has(c.dataIndex + 1) ? 4 : 0),
            pointBackgroundColor: c => mgrColor(s, i, mgrIdx(s, c.dataIndex + 1)),
            pointBorderColor: col,
            pointBorderWidth: 1.5,
            order: 1,
          },
          {
            ...base,
            label: "",
            borderColor: col,
            borderWidth: 1.5,
            pointRadius: 0,
            order: 0,
            segment: { borderColor: c => mgrColor(s, i, mgrIdx(s, c.p1DataIndex + 1)) },
          },
        ];
      }),
    },
    options: scaleOpts(metric),
  });
  if (activeTab === "pace") drawPace();
}

// ---- ペース比較 ----
const REF = { t: "トップ3", u: "上位", m: "中位", d: "ボトム3" };
const refName = k => REF[k];
function bands(L) { const n = L.length, k = Math.ceil(n / 3); return { t: L.slice(0, 3), u: L.slice(3, k), m: L.slice(k, n - 3), d: L.slice(n - 3) }; }
function catAt(p, n) {
  const rkm = rankMap(p.s, Math.max(1, Math.min(n, p.rounds)));
  return bands(Object.keys(rkm).sort((a, b) => rkm[a] - rkm[b]).map((tid, i) => ({ tid, t: p.s.all[tid], rk: i + 1 })));
}
const catOf = p => (paceMode === "at" ? catAt(p, round) : p.catFinal);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

async function loadPace() {
  const cur = latest(club), lg = cur && leagueOf(cur, club), cd = cur && await load(cur.key, lg), ct = cd?.teams[club];
  if (!ct) { pace = null; renderRefs(); return; }
  const past = [];
  for (const s of idx.seasons) {
    const d = s.key === cur.key ? null : await load(s.key, lg);
    if (!d || d.through !== d.rounds) continue;
    const L = Object.entries(d.teams).map(([tid, t]) => ({ tid, t, b: t.byRound[d.rounds - 1] }))
      .sort((a, b) => b.b.points - a.b.points || b.b.gd - a.b.gd || b.b.gf - a.b.gf);
    past.push({ key: s.key, label: s.label, rounds: d.rounds, s: { all: d.teams, rk: {} }, catFinal: bands(L.map((x, i) => ({ ...x, rk: i + 1 }))) });
  }
  pace = { label: cur.label, lg, by: ct.byRound, through: cd.through, rounds: cd.rounds, past };
  if (paceAuto) {
    const n = Object.keys(cd.teams).length, rk = rankMap({ all: cd.teams, rk: {} }, Math.max(1, cd.through))[club] || 1;
    const prev = past.find(p => p.key === idx.seasons[1]?.key) || past[0], k = rk <= n / 2 ? "t" : "d";
    if (prev) {
      paceOff = new Set(past.filter(p => p !== prev).map(p => p.key));
      refs = new Set([k]);
      avgOff = new Set([k]);
      indOn = new Set(prev.catFinal[k].map(x => `${prev.key}|${x.tid}`));
      paceMode = "final";
      syncSegUI();
    }
  }
  renderPaceSelectors();
  renderRefs();
}

function renderPaceSelectors() {
  if (!pace) { $("#refSeasons").innerHTML = ""; $("#refTop").innerHTML = ""; return; }
  $("#refSeasons").innerHTML = pace.past.map(p => {
    const on = !paceOff.has(p.key);
    return `<button type="button" class="p-chip${on ? " is-on" : ""}" data-ps="${esc(p.key)}" aria-pressed="${on}">${esc(p.label)}</button>`;
  }).join("");
  $$("#refSeasons .p-chip").forEach(btn => {
    btn.onclick = () => {
      paceAuto = false;
      const k = btn.dataset.ps;
      paceOff.has(k) ? paceOff.delete(k) : paceOff.add(k);
      renderPaceSelectors();
      renderRefs();
      drawPace();
    };
  });

  $("#refTop").innerHTML = Object.entries(REF).map(([k, name]) => {
    const on = refs.has(k);
    return `<button type="button" class="p-chip${on ? " is-on" : ""}" style="--pc:var(--rf${k})" data-cat="${k}" aria-pressed="${on}"><span class="p-dot" aria-hidden="true"></span>${name}</button>`;
  }).join("");
  $$("#refTop .p-chip").forEach(btn => {
    btn.onclick = () => {
      paceAuto = false;
      const k = btn.dataset.cat;
      refs.has(k) ? refs.delete(k) : refs.add(k);
      renderPaceSelectors();
      renderRefs();
      drawPace();
      setRound(round);
    };
  });
}

function renderRefs() {
  if (!pace) { $("#refs").innerHTML = ""; return; }
  const inc = pace.past.filter(p => !paceOff.has(p.key));
  const selectedCats = Object.keys(REF).filter(k => refs.has(k));
  if (!selectedCats.length) {
    $("#refs").innerHTML = `<div class="pace-note">上の「順位帯」から比較対象を1つ以上選んでください。</div>`;
    return;
  }

  $("#refs").innerHTML = selectedCats.map(k => {
    const avgOn = !avgOff.has(k);
    const body = k === "m"
      ? `<div class="pace-note">中位はクラブ数が多いため平均線のみ表示します。</div>`
      : inc.length
        ? inc.map(p => `<div class="pace-year-row"><span class="pace-year">${esc(p.label)}</span><div class="pace-clubs">${
            catOf(p)[k].map(x => {
              const idKey = `${p.key}|${x.tid}`;
              const on = indOn.has(idKey);
              const cc = CLUB_COLOR[x.tid];
              const ic = cc ? cc[0] : "var(--muted)";
              return `<button type="button" class="ind-chip${on ? " is-on" : ""}" style="--pc:var(--rf${k});--ic:${ic}" data-ind="${esc(idKey)}" aria-pressed="${on}">
                <span class="ind-dot" aria-hidden="true"></span>
                <span class="ind-rk">${x.rk}</span>
                <span>${esc(x.t.name)}</span>
              </button>`;
            }).join("")
          }</div></div>`).join("")
        : `<div class="pace-note">「対象年」を1つ以上選択すると個別クラブを表示できます。</div>`;

    return `<div class="pace-group" style="--pc:var(--rf${k})">
      <div class="pace-group-head">
        <span class="pace-group-title"><i></i>${refName(k)}</span>
        <button type="button" class="avg-toggle${avgOn ? " is-on" : ""}" data-avg="${k}" aria-pressed="${avgOn}">平均線 ${avgOn ? "ON" : "OFF"}</button>
      </div>
      ${body}
    </div>`;
  }).join("");

  $$("#refs .avg-toggle").forEach(btn => {
    btn.onclick = () => {
      paceAuto = false;
      const k = btn.dataset.avg;
      avgOff.has(k) ? avgOff.delete(k) : avgOff.add(k);
      renderRefs();
      drawPace();
      setRound(round);
    };
  });
  $$("#refs .ind-chip").forEach(btn => {
    btn.onclick = () => {
      paceAuto = false;
      const k = btn.dataset.ind;
      indOn.has(k) ? indOn.delete(k) : indOn.add(k);
      renderRefs();
      drawPace();
      setRound(round);
    };
  });
}

const endLabels = {
  id: "endLabels",
  afterDatasetsDraw(ch) {
    const c = ch.ctx, items = [];
    ch.data.datasets.forEach((d, i) => {
      const k = d.endLabel ? d.data.reduce((m, v, n) => (v != null ? n : m), -1) : -1;
      if (k >= 0) {
        const pt = ch.getDatasetMeta(i).data[k];
        if (pt) items.push({ t: d.endLabel, x: pt.x, y: pt.y, col: d.borderColor });
      }
    });
    items.sort((a, b) => a.y - b.y);
    items.forEach((it, n) => { if (n && it.y - items[n - 1].y < 12) it.y = items[n - 1].y + 12; });
    for (let n = items.length - 1; n >= 0; n--) {
      const lim = n === items.length - 1 ? ch.chartArea.bottom - 2 : items[n + 1].y - 12;
      if (items[n].y > lim) items[n].y = lim;
    }
    c.save();
    c.font = `700 11px "Inter", "Noto Sans JP", system-ui, sans-serif`;
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = 3.5;
    c.strokeStyle = css("--surface");
    items.forEach(it => {
      const x = Math.min(it.x - 2, ch.chartArea.right - 2), y = it.y - 7;
      c.strokeText(it.t, x, y);
      c.fillStyle = it.col;
      c.fillText(it.t, x, y);
    });
    c.restore();
  },
};

function drawPace() {
  if (activeTab !== "pace") return;
  charts.chPace?.destroy();
  delete charts.chPace;
  const box = $("#paceSec .chart-box");
  if (!pace || !pace.past.length) {
    $("#paceLegend").textContent = pace ? "比較できる過去シーズン（確定済み）がありません。" : "";
    box.style.display = "none";
    return;
  }
  box.style.display = "";
  const labels = Array.from({ length: pace.rounds }, (_, i) => i + 1);
  const inc = pace.past.filter(p => !paceOff.has(p.key)), ds = [];
  const val = (x, r) => x.t.byRound[r - 1]?.[metric];

  for (const k of Object.keys(REF).filter(k => refs.has(k))) {
    const xs = inc.flatMap(p => catOf(p)[k]);
    if (xs.length && !avgOff.has(k)) {
      ds.push({
        label: `${refName(k)}${paceMode === "at" ? "だったクラブ" : ""}平均`,
        data: labels.map(r => {
          const v = xs.map(x => val(x, r)).filter(y => y != null);
          return v.length ? avg(v) : null;
        }),
        borderColor: css(`--rf${k}`),
        borderWidth: 2.5,
        borderDash: [6, 3],
        pointRadius: 0,
        tension: 0.1,
        order: 1,
      });
    }
    inc.forEach((p, si) => catOf(p)[k].filter(x => indOn.has(`${p.key}|${x.tid}`)).forEach(x => {
      ds.push({
        label: "",
        endLabel: `${p.label.slice(2)} ${x.t.name}${paceMode === "at" ? ` 最終${rankMap(p.s, p.rounds)[x.tid]}位` : ""}`,
        data: labels.map(r => val(x, r) ?? null),
        borderColor: css(`--rf${k}`),
        borderWidth: 1.5,
        borderDash: [[], [8, 4], [2, 3], [10, 3, 2, 3], [1, 4], [12, 2]][si % 6],
        pointRadius: 0,
        tension: 0.1,
        order: 2,
      });
    }));
  }
  const c0 = css("--c0");
  ds.push({
    label: `${pace.label} ${idx.teams[club]}（選択中）`,
    data: labels.map(r => (r <= pace.through ? pace.by[r - 1][metric] : null)),
    borderColor: c0,
    backgroundColor: c0,
    borderWidth: 3.5,
    pointRadius: 0,
    tension: 0.1,
    order: 0,
  });

  charts.chPace = new Chart($("#chPace"), {
    type: "line",
    plugins: [cursor, endLabels],
    data: { labels, datasets: ds },
    options: scaleOpts(metric),
  });
  $("#paceLegend").innerHTML = `<span>太い青線＝選択クラブ（今季）</span><span>太い破線＝該当順位帯の平均</span><span>細線＝個別クラブ</span><span>34節制シーズンは34節まで</span>`;
}

init();
