// Copyright (c) 2026 pokiwo22. All rights reserved. 無断転載・複製・商用利用禁止(LICENSE参照)
const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");

let urlTimer, refs = new Set(), paceOff = new Set(), rkMode = "at", paceMode = "final", paceTimer = 0, indOn = new Set(), avgOff = new Set(), pace = null, idx, club, picked = [], round = 1, S = [], charts = {};
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
// 文字色: メイン色が明るすぎて読めない(黄色など)ときは、サブ色を文字色にする。メイン色は左の帯に残る。どちらも暗くして、背景とのコントラストを確保
function textColor(cc) {
  const lum = c => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = c => 1.05 / (lum(c) + 0.05);
  const darken = c => { let x = c; for (let k = 0; k < 12 && ratio(x) < 4.5; k++) x = "#" + [1, 3, 5].map(i => Math.round(parseInt(x.slice(i, i + 2), 16) * 0.9).toString(16).padStart(2, "0")).join(""); return x; };
  const pick = ratio(cc[0]) >= 3 || !cc[1] || ratio(cc[1]) < 3 ? cc[0] : cc[1];
  return darken(pick);
}

const load = (key, lg) => files[key + lg] ??= fetch(`data/${key}_${lg}.json?v=${encodeURIComponent(idx.updated)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
const latest = id => idx.seasons.find(s => s.leagues.J1?.includes(id) || s.leagues.J2?.includes(id));
const leagueOf = (s, id) => (s.leagues.J1?.includes(id) ? "J1" : s.leagues.J2?.includes(id) ? "J2" : null);

async function init() {
  idx = await fetch("data/index.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null);
  if (!idx || !idx.seasons.length) return void ($("#cards").textContent = "データがありません。");
  $("#updated").textContent = new Date(idx.updated).toLocaleString("ja-JP");
  const q = new URLSearchParams(location.search);
  club = q.get("club") && idx.teams[q.get("club")] ? q.get("club") : idx.seasons[0].leagues.J1[0];
  picked = q.get("seasons") ? q.get("seasons").split(",") : idx.seasons.slice(0, 2).map(s => s.key);
  round = +q.get("round") || 0;
  $("#league").value = leagueOf(latest(club), club) || "J1";
  fillClubs();
  $("#league").onchange = () => { fillClubs(true); refresh(); };
  $("#club").onchange = () => { club = $("#club").value; refresh(); };
  // 下のパッド: どこを触っても中央にバーが出て、そこから横ドラッグで相対移動。画面幅1/3動かすと全節を移動できる
  const pad = $("#pad"), th = pad.querySelector(".thumb");
  let x0, r0, dx, raf;
  pad.onpointerdown = e => {
    x0 = e.clientX; r0 = round; dx = 0; th.style.transform = "translateX(0)"; pad.classList.add("on");
    try { pad.setPointerCapture(e.pointerId); } catch {}
  };
  pad.onpointermove = e => {
    if (!pad.classList.contains("on")) return;
    dx = e.clientX - x0;
    raf ||= requestAnimationFrame(() => {
      raf = 0;
      const half = pad.clientWidth / 2 - 8;
      th.style.transform = `translateX(${Math.max(-half, Math.min(half, dx))}px)`;
      setRound(r0 + Math.round(dx / (innerWidth / 3 / Math.max(1, +$("#round").max - 1))));
    });
  };
  pad.onpointerup = pad.onpointercancel = pad.onlostpointercapture = () => pad.classList.remove("on");
  document.addEventListener("pointerdown", e => { if (e.target.tagName !== "CANVAS") hideTips(); });
  $("#round").onkeydown = e => e.stopPropagation();
  document.onkeydown = e => {
    if (e.target.tagName === "SELECT" || e.target.type === "checkbox") return;
    if (e.key === "ArrowLeft") setRound(round - 1);
    if (e.key === "ArrowRight") setRound(round + 1);
  };
  matchMedia("(prefers-color-scheme: dark)").onchange = draw;
  if (["points", "gd", "gf", "ga"].includes(q.get("m"))) $("#metric").value = q.get("m");
  $("#metric").onchange = () => { draw(); setRound(round); };
  if (q.has("ref")) refs = new Set(q.get("ref").split(",").filter(k => "tumd".includes(k) && k));
  indOn = new Set((q.get("ind") || "").split(",").filter(Boolean));
  rkMode = q.get("rk") === "final" ? "final" : "at";
  paceMode = q.get("pm") === "at" ? "at" : "final";
  document.querySelectorAll('#paceMode input[name="pm"]').forEach(i => {
    i.checked = i.value === paceMode;
    i.onchange = () => { paceMode = i.value; renderRefs(); drawPace(); setRound(round); };
  });
  document.querySelectorAll('#zoomCtl input[name="zrk"]').forEach(i => {
    i.checked = i.value === rkMode;
    i.onchange = () => { rkMode = i.value; renderStrips(); setRound(round); };
  });
  avgOff = new Set((q.get("avgoff") || "").split(",").filter(Boolean));
  $("#paceBox").ontoggle = () => { drawPace(); fitChips(); };
  $("#refs").onchange = e => { // 入れ子のチェック(種類 / 個別クラブ)を1か所で処理
    const i = e.target;
    if (i.dataset.avg) i.checked ? avgOff.delete(i.dataset.avg) : avgOff.add(i.dataset.avg);
    else if (i.dataset.ind) i.checked ? indOn.add(i.dataset.ind) : indOn.delete(i.dataset.ind);
    else i.checked ? refs.add(i.value) : refs.delete(i.value);
    renderRefs(); drawPace(); setRound(round);
  };
  refresh();
}

function fillClubs(reset) {
  const lg = $("#league").value;
  const ids = Object.keys(idx.teams).filter(id => leagueOf(latest(id), id) === lg)
    .sort((a, b) => idx.teams[a].localeCompare(idx.teams[b], "ja"));
  $("#club").innerHTML = ids.map(id => `<option value="${id}">${idx.teams[id]}</option>`).join("");
  if (reset || !ids.includes(club)) club = ids[0];
  $("#club").value = club;
}

async function refresh() {
  const box = $("#seasons");
  box.querySelectorAll("label").forEach(l => l.remove());
  for (const s of idx.seasons) {
    const lg = leagueOf(s, club);
    const l = document.createElement("label");
    l.className = lg ? "" : "off";
    l.innerHTML = `<input type="checkbox" value="${s.key}" ${lg ? "" : "disabled"} ${lg && picked.includes(s.key) ? "checked" : ""}> ${s.label}${lg ? `（${lg}）` : "（不在）"}`;
    l.querySelector("input").onchange = () => {
      picked = [...box.querySelectorAll("input:checked")].map(i => i.value);
      refresh();
    };
    box.append(l);
  }
  $("#seasonsSum").innerHTML = `<b class="sumclub">${idx.teams[club]}</b><small class="sumlg">${$("#league").value}</small>`;
  const cc = CLUB_COLOR[club], cs = $("#seasonsBox").style;
  cs.setProperty("--club", cc ? cc[0] : "var(--tint-line)");
  cs.setProperty("--club2", cc ? cc[1] || cc[0] : "var(--tint-line)"); // サブ色(単色クラブはメイン色と同じ)
  cs.setProperty("--clubt", cc ? textColor(cc) : "var(--fg)");
  const keys = idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club));
  S = (await Promise.all(keys.map(async s => {
    const lg = leagueOf(s, club), d = await load(s.key, lg), t = d?.teams[club];
    return t && { key: s.key, label: s.label, lg, rounds: d.rounds, through: d.through, by: t.byRound, all: d.teams, mgr: t.mgr || [], matches: t.matches || [] };
  }))).filter(Boolean);
  const max = Math.max(1, ...S.map(s => s.rounds));
  $("#round").max = max;
  if (!round) round = Math.max(1, ...S.filter(s => s.key === idx.seasons[0].key).map(s => s.through), 1);
  setRound(round);
  await loadPace();
  draw();
  mgrLegend();
  renderStrips();
  renderTier();
}

// 監督: mgr=[{r:その監督の最初の節,n:名前}]。節に応じた監督と、中心線の色(最初の監督=シーズン色、以降は別色)
const PAL = ["#facc15", "#ffffff", "#111827", "#f97316"];
const mgrIdx = (s, r) => s.mgr.reduce((k, m, j) => (m.r <= r ? j : k), 0);
const mgrColor = (s, i, k) => (k === 0 ? css(`--c${i % 6}`) : PAL[(k - 1) % PAL.length]);
const short = n => (n.includes("・") ? n.split("・").pop() : n);

// 順位: 勝点 > 得失点 > 総得点(Jリーグ順位決定順)。その節時点の累積で比較
const rank = (s, r) => {
  const m = at(s, r);
  if (!m) return null;
  const L = Object.values(s.all).map(t => t.byRound[r - 1]);
  const better = b => b.points > m.points || (b.points === m.points && (b.gd > m.gd || (b.gd === m.gd && b.gf > m.gf)));
  return { n: L.filter(better).length + 1, of: L.length };
};

const at = (s, r) => (r <= s.through ? s.by[r - 1] : null);

function setRound(r) {
  const prev = round;
  round = Math.min(+$("#round").max, Math.max(1, r));
  if (round !== prev && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8); // Androidのみ(iOS Safariは非対応)
  $("#round").value = round;
  $("#roundOut").textContent = round;
  clearTimeout(urlTimer); // URL更新は操作が止まってから(連続replaceStateは重く、iOSでは制限もある)
  urlTimer = setTimeout(() => history.replaceState(null, "", "?" + new URLSearchParams({ club, seasons: picked.join(","), round, m: $("#metric").value, ref: [...refs].join(","), ...(indOn.size ? { ind: [...indOn].join(",") } : {}), ...(avgOff.size ? { avgoff: [...avgOff].join(",") } : {}), ...(rkMode === "final" ? { rk: "final" } : {}), ...(paceMode === "at" ? { pm: "at" } : {}) })), 250);
  cards();
  if ($("#pmN")) $("#pmN").textContent = round;
  if (paceMode === "at" && $("#paceBox").open) { clearTimeout(paceTimer); paceTimer = setTimeout(() => { renderRefs(); drawPace(); }, 140); }
  Object.values(charts).forEach(moveCursor); // グラフ全再描画はせず、縦線(DOM)を動かすだけ
  dimStrips();
  renderTier();
}

function cards() {
  const name = k => (k === idx.seasons[0].key ? "今季" : k === idx.seasons[1]?.key ? "昨季" : null);
  $("#cards").innerHTML = S.map((s, i) => {
    const b = at(s, round), c = `var(--c${i % 6})`;
    const k = mgrIdx(s, round), mg = s.mgr[k];
    const head = `<h3><span>${s.label} <small>${s.lg}${name(s.key) ? " / " + name(s.key) : ""}</small></span>${mg ? `<b class="mgr" title="${mg.n}"><i class="dot" style="background:${mgrColor(s, i, k)}"></i>${short(mg.n)}</b>` : ""}</h3>`;
    if (!b) return `<div class="card" style="--c:${c}">${head}<div class="big">—</div><div class="row">未消化の節</div></div>`;
    const diffs = i === 0 ? S.slice(1).map(o => {
      const x = at(o, round);
      return x ? `<div>${name(o.key) || o.label}比 <span class="${cls(b.points - x.points)}">勝点 ${signed(b.points - x.points)}</span> / <span class="${cls(b.gd - x.gd)}">得失 ${signed(b.gd - x.gd)}</span></div>` : "";
    }).join("") : "";
    return `<div class="card" style="--c:${c}">${head}
      <div class="big">${b.points}<span class="row"> 勝点</span> <span class="rank">${rank(s, round) ? `${rank(s, round).n}位<span class="row">/${rank(s, round).of}</span>` : ""}</span></div>
      <div class="row">得失点 <b class="${cls(b.gd)}">${signed(b.gd)}</b>（${b.gf}-${b.ga}）</div>
      <div class="row">${b.w}勝 ${b.d}分 ${b.l}敗（${b.played}試合）</div>
      ${b.pending ? `<div class="tag">延期あり（${b.pending}試合は後日消化）</div>` : ""}
      ${diffs ? `<div class="diff">${diffs}</div>` : ""}</div>`;
  }).join("");
}

function moveCursor(ch) {
  if (!ch.cur) {
    ch.cur = document.createElement("div");
    ch.cur.className = "cur";
    ch.canvas.parentNode.append(ch.cur);
  }
  const { top, bottom } = ch.chartArea;
  ch.cur.style.top = top + "px";
  ch.cur.style.height = bottom - top + "px";
  ch.cur.style.transform = `translateX(${ch.scales.x.getPixelForValue(round - 1)}px)`;
}
const cursor = { id: "cursor", afterLayout: moveCursor, afterDestroy: ch => ch.cur?.remove() };

// ---- 拡大表示: 選んだ節の前後だけを広げ、折れ線の上に「結果色の丸(中に相手の順位)」を載せる ----
const MIN_RANK_ROUND = 4; // 開幕直後(1〜3節)は順位に意味がないので「—」
const RES = { w: "#15803d", d: "#facc15", l: "#b91c1c" };
const rankMap = (s, n) => { // 第n節終了時点の順位(勝点→得失点→総得点)
  s.rk ??= {};
  return s.rk[n] ??= Object.fromEntries(Object.entries(s.all)
    .map(([id, t]) => [id, t.byRound[n - 1]])
    .sort((a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd || b[1].gf - a[1].gf)
    .map(([id], i) => [id, i + 1]));
};
// ---- 順位帯ごとの成績: 相手を「そのシーズンの最終順位」で トップ3 / 上位 / 中位 / 下位 に分けて、勝・分・負を集計 ----
// トップ3=1〜3位、上位=4位〜上位1/3、下位=下位1/3、中位=その間(J1/20クラブなら 1-3 / 4-7 / 8-13 / 14-20)
function tierOf(rank, n) { const k = Math.ceil(n / 3); return rank <= 3 ? 0 : rank <= k ? 1 : rank > n - k ? 3 : 2; }

function renderTier() {
  const el = $("#tierBody");
  if (!el) return;
  const NAME = ["トップ3", "上位", "中位", "下位"];
  el.innerHTML = S.filter(s => s.matches.length).map(s => {
    const n = Object.keys(s.all).length, k = Math.ceil(n / 3), rk = rankMap(s, s.through);
    const T = [0, 1, 2, 3].map(() => ({ w: 0, d: 0, l: 0 }));
    for (const [r, opp, , gf, ga] of s.matches) {
      if (r > round || gf == null) continue; // 未消化は集計しない
      T[tierOf(rk[opp], n)][gf > ga ? "w" : gf < ga ? "l" : "d"]++;
    }
    const g = t => t.w + t.d + t.l, pts = t => 3 * t.w + t.d, ppg = t => (g(t) ? pts(t) / g(t) : null);
    const sum = (...ts) => ({ w: ts.reduce((x, t) => x + t.w, 0), d: ts.reduce((x, t) => x + t.d, 0), l: ts.reduce((x, t) => x + t.l, 0) });
    const range = ["1〜3位", `4〜${k}位`, `${k + 1}〜${n - k}位`, `${n - k + 1}〜${n}位`];
    const cells = T.map((t, i) => `<div class="tcell"><div class="tl">${NAME[i]}<small>${range[i]}</small></div>
      <div class="tbar">${g(t) ? `<i class="w" style="flex:${t.w}"></i><i class="d" style="flex:${t.d}"></i><i class="l" style="flex:${t.l}"></i>` : ""}</div>
      <div class="tn">${t.w}勝${t.d}分${t.l}敗<br>勝点率 <b>${ppg(t) == null ? "—" : ppg(t).toFixed(2)}</b></div></div>`).join("");
    // タイプ判定(目安): 全体の強さ(勝点率)と、上位(1〜上位帯)/下位への差の両方で見る。上位・下位が各3試合未満のうちは出さない
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
    return `<div class="trow"><h4><i class="sbar" style="background:var(--c${S.indexOf(s) % 6})"></i>${s.label}（${s.lg}）<span class="ttype">${type}</span></h4><div class="tgrid">${cells}</div></div>`;
  }).join("") + `<div class="note2">相手を、そのシーズンの<b>最終順位</b>で4つに分けています（今季は現時点の順位）。選んだ節までの成績です。勝点率＝1試合あたりの勝点。タイプは、上位（トップ3+上位）と下位への勝点率による目安です。</div>`;
}

function mgrLegend() {
  const rows = S.filter(s => s.mgr.length > 1).map(s => {
    const i = S.indexOf(s);
    return `<div><b>${s.label}</b> ` + s.mgr.map((m, k) => `<span class="ml"><i class="dot" style="background:${mgrColor(s, i, k)}"></i>${short(m.n)} ${m.r}節〜</span>`).join(" ") + "</div>";
  });
  $("#mgrLegend").innerHTML = rows.length ? "<div>線の中心の色＝監督（途中交代あり）</div>" + rows.join("") : "";
}

const scaleOpts = f => {
  const grid = css("--line"), fg = css("--muted");
  return {
    animation: false, maintainAspectRatio: false, events: [], // タップ/ホバーの吹き出しは出さない
    scales: {
      x: { title: { display: true, text: "節", color: fg }, ticks: { color: fg, autoSkip: false, maxRotation: 0, callback(v) { const l = this.getLabelForValue(v); return l === 1 || l % 5 === 0 ? l : ""; } }, grid: { color: grid } },
      y: { ticks: { color: fg }, grid: { color: c => (f === "gd" && c.tick.value === 0 ? "#dc2626" : grid), lineWidth: c => (f === "gd" && c.tick.value === 0 ? 2 : 1) } },
    },
    plugins: {
      legend: { onClick: () => {}, labels: { filter: it => it.text, color: css("--fg"), boxWidth: 14, boxHeight: 3, font: { size: 11 } } },
      tooltip: { enabled: false },
    },
  };
};

// ---- グラフ下の勝敗の帯: 小さな正方形(色=結果、中=相手の順位・1行)。1シーズンを2段に並べる ----
function renderStrips() {
  const el = $("#strips");
  if (!el) return;
  const SS = S.filter(s => s.matches.length), cols = Math.max(1, ...SS.map(s => Math.ceil(s.rounds / 3))); // 全シーズン共通の列数=マスの大きさが同じ
  el.innerHTML = SS.map(s => {
    const q = s.matches.map(([r, opp, home, gf, ga]) => {
      const played = gf != null; // 未消化の試合は得点/失点が null
      const res = !played ? "u" : gf > ga ? "w" : gf < ga ? "l" : "d";
      const rk = rkMode === "final" ? rankMap(s, s.through)[opp] : played && r >= MIN_RANK_ROUND ? rankMap(s, r - 1)[opp] : null;
      const nm = s.all[opp]?.name ?? opp, jp = { w: "勝ち", d: "分け", l: "負け", u: "未消化" }[res];
      return `<div class="sq ${res} ${home ? "h" : "a"}" data-r="${r}" style="grid-column:${((r - 1) % cols) + 1};grid-row:${Math.ceil(r / cols)}" title="第${r}節 ${home ? "ホーム" : "アウェイ"} vs ${nm} ${played ? `${gf}-${ga} ` : ""}${jp}${rk ? `（相手は${rkMode === "final" ? "最終" : "その時"}${rk}位）` : ""}">${rk ?? "—"}</div>`;
    }).join("");
    return `<div class="srow" style="--sc:var(--c${S.indexOf(s) % 6})"><div class="slab">${s.label.replace(/^20/, "")}</div><div class="sgrid" style="--c:${cols}">${q}</div></div>`;
  }).join("") + `<div class="note2"><span class="lg w">勝ち</span> <span class="lg d">分け</span> <span class="lg l">負け</span> <span class="lg u">未消化</span> ／ 数字＝相手の${rkMode === "final" ? "<b>最終順位</b>（未確定のシーズンは現時点）" : "その試合の<b>直前</b>の順位（1〜3節は—）"} ／ 右下の小さな文字: H＝ホーム・A＝アウェイ ／ 太い枠＝選んだ節 ／ 上から順に、節の若い順（3段）</div>`;
  dimStrips();
}

function dimStrips() {
  document.querySelectorAll("#strips .sq").forEach(e => { e.classList.toggle("dim", +e.dataset.r > round); e.classList.toggle("now", +e.dataset.r === round); });
}

function draw() {
  const max = Math.max(1, ...S.map(s => s.rounds)), f = $("#metric").value;
  const labels = Array.from({ length: max }, (_, i) => i + 1);
  charts.chPts?.destroy();
  charts.chPts = new Chart($("#chPts"), {
    type: "line",
    plugins: [cursor],
    data: {
      labels,
      datasets: S.flatMap((s, i) => {
        const data = labels.map(r => at(s, r)?.[f] ?? null), col = css(`--c${i % 6}`), l = `${s.label}（${s.lg}）`;
        const base = { data, pointRadius: 0, pointHoverRadius: 0, tension: 0 };
        return [
          { ...base, label: l, borderColor: col, backgroundColor: col, borderWidth: i === 0 ? 3 : 2.5, order: 1 }, // 外側=シーズン色
          { ...base, label: "", borderColor: col, borderWidth: 1.5, order: 0, // 中心=監督色(監督ごとに区間の色を変える)
            segment: { borderColor: c => mgrColor(s, i, mgrIdx(s, c.p1DataIndex + 1)) } },
        ];
      }),
    },
    options: scaleOpts(f),
  });
  drawPace();
}

// ---- ペース比較: 選択クラブの今季 vs 過去の確定シーズンのトップ3/上位/中位/ボトム3(同じ節数のシーズンのみ) ----
const REF = { t: "トップ3", u: "上位", m: "中位", d: "ボトム3" }; // 被らない4区分。トップ3=1〜3位 / 上位=4位〜上位1/3 / ボトム3=下から3クラブ / 中位=その間
const refName = k => REF[k];
function bands(L) { const n = L.length, k = Math.ceil(n / 3); return { t: L.slice(0, 3), u: L.slice(3, k), m: L.slice(k, n - 3), d: L.slice(n - 3) }; }
// シーズンごとの分類。final=そのシーズンの最終順位 / at=第N節(選んだ節)の時点の順位(そのクラブのシーズン全体の推移を比べる)
function catAt(p, n) {
  const rkm = rankMap(p.s, Math.max(1, Math.min(n, p.rounds)));
  return bands(Object.keys(rkm).sort((a, b) => rkm[a] - rkm[b]).map((tid, i) => ({ tid, t: p.s.all[tid], rk: i + 1 })));
}
const catOf = p => (paceMode === "at" ? catAt(p, round) : p.catFinal);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

async function loadPace() {
  const cur = latest(club), lg = cur && leagueOf(cur, club), cd = cur && await load(cur.key, lg), ct = cd?.teams[club];
  if (!ct) return void (pace = null);
  const past = [];
  for (const s of idx.seasons) {
    const d = s.key === cur.key ? null : await load(s.key, lg);
    if (!d || d.through !== d.rounds) continue; // 確定済みのシーズン(節数が違えば、ある節まで)
    const L = Object.entries(d.teams).map(([tid, t]) => ({ tid, t, b: t.byRound[d.rounds - 1] }))
      .sort((a, b) => b.b.points - a.b.points || b.b.gd - a.b.gd || b.b.gf - a.b.gf);
    past.push({ key: s.key, label: s.label, rounds: d.rounds, s: { all: d.teams, rk: {} }, catFinal: bands(L.map((x, i) => ({ ...x, rk: i + 1 }))) });
  }
  pace = { label: cur.label, lg, by: ct.byRound, through: cd.through, rounds: cd.rounds, past };
  $("#refSeasons").innerHTML = "<span class=\"lab\">対象</span>" + past.map(p => `<label><input type="checkbox" value="${p.key}" ${paceOff.has(p.key) ? "" : "checked"}>${p.label}</label>`).join("");
  $("#refSeasons").querySelectorAll("input").forEach(i => {
    i.onchange = () => { i.checked ? paceOff.delete(i.value) : paceOff.add(i.value); renderRefs(); drawPace(); };
  });
  renderRefs();
}

// 比較の選択UI: 区分(トップ3/上位/中位/ボトム3)のチェックの中に、シーズンごとの個別クラブを入れ子で出す
function renderRefs() {
  if (!pace) return void ($("#refs").innerHTML = "");
  const inc = pace.past.filter(p => !paceOff.has(p.key));
  const top = Object.entries(REF).map(([k, name]) => `<label class="top"><input type="checkbox" value="${k}" ${refs.has(k) ? "checked" : ""}>${name}</label>`).join("");
  const subs = Object.entries(REF).filter(([k]) => refs.has(k)).map(([k]) =>
    `<div class="sub"><div class="sh"><b class="sn" style="color:var(--rf${k})">${refName(k)}</b>` +
    `<label><input type="checkbox" data-avg="${k}" ${avgOff.has(k) ? "" : "checked"}>平均</label></div>` +
    (k === "m" ? `<div class="note3">中位は、クラブ数が多いので、平均のみ</div>` :
      `<div class="rows">` + inc.map(p => `<div class="pr"><span class="py">${p.label}</span>` + catOf(p)[k].map(x =>
        `<label><input type="checkbox" data-ind="${p.key}|${x.tid}" ${indOn.has(`${p.key}|${x.tid}`) ? "checked" : ""}><span class="rkn">${x.rk}</span><span class="nm" style="color:${CLUB_COLOR[x.tid] ? textColor(CLUB_COLOR[x.tid]) : "inherit"}">${x.t.name}</span></label>`).join("") + "</div>").join("") + "</div>") + "</div>").join("");
  $("#refs").innerHTML = `<div class="toprow">${top}</div>${subs}`;
  fitChips();
}

// 個別クラブの枠: この端末の実際の文字幅で一番長い名前に合わせて、全部の枠を同じ大きさにする(文字が欠けない)
function fitChips() {
  const L = [...document.querySelectorAll("#refs .pr label")];
  if (!L.length) return;
  L.forEach(l => (l.style.flex = "0 0 auto", l.style.width = "max-content"));
  const w = Math.ceil(Math.max(84, ...L.map(l => l.offsetWidth))) + 6;
  L.forEach(l => (l.style.flex = `0 0 ${w}px`, l.style.width = `${w}px`));
}
document.fonts?.ready.then(() => fitChips());

const endLabels = { // 個別線の右端にクラブ名(シーズン下2桁つき)を描く。縦に重なる分は少しずつずらす
  id: "endLabels",
  afterDatasetsDraw(ch) {
    const c = ch.ctx, items = [];
    ch.data.datasets.forEach((d, i) => {
      const k = d.endLabel ? d.data.reduce((m, v, n) => (v != null ? n : m), -1) : -1;
      if (k >= 0) { const pt = ch.getDatasetMeta(i).data[k]; items.push({ t: d.endLabel, x: pt.x, y: pt.y, col: d.borderColor }); }
    });
    items.sort((a, b) => a.y - b.y);
    items.forEach((it, n) => { if (n && it.y - items[n - 1].y < 11) it.y = items[n - 1].y + 11; });
    for (let n = items.length - 1; n >= 0; n--) { // 下にはみ出したら、下端から上へ詰め直す
      const lim = n === items.length - 1 ? ch.chartArea.bottom - 2 : items[n + 1].y - 11;
      if (items[n].y > lim) items[n].y = lim;
    }
    c.save(); c.font = "10px system-ui, sans-serif"; c.textAlign = "right"; c.textBaseline = "middle";
    items.forEach(it => { c.fillStyle = it.col; c.fillText(it.t, Math.min(it.x - 2, ch.chartArea.right - 1), it.y); });
    c.restore();
  },
};

function drawPace() {
  if (!$("#paceBox").open) return;
  charts.chPace?.destroy();
  delete charts.chPace;
  const box = $("#paceSec .box");
  if (!pace || !pace.past.length) { $("#paceLegend").textContent = pace ? "比較できる過去シーズン（確定済みで同じ節数）がありません。" : ""; box.style.display = "none"; return; }
  box.style.display = "";
  const f = $("#metric").value, labels = Array.from({ length: pace.rounds }, (_, i) => i + 1);
  const inc = pace.past.filter(p => !paceOff.has(p.key)), ds = [];
  const val = (x, r) => x.t.byRound[r - 1]?.[f]; // 節数が少ないシーズンは、その節以降なし
  for (const k of Object.keys(REF).filter(k => refs.has(k))) {
    const xs = inc.flatMap(p => catOf(p)[k]);
    if (xs.length && !avgOff.has(k)) ds.push({ label: `${refName(k)}${paceMode === "at" ? "だったクラブ" : "のクラブ"}の平均`, data: labels.map(r => { const v = xs.map(x => val(x, r)).filter(y => y != null); return v.length ? avg(v) : null; }),
      borderColor: css(`--rf${k}`), borderWidth: 2.5, borderDash: [6, 3], pointRadius: 0, tension: 0, order: 1 });
    inc.forEach((p, si) => catOf(p)[k].filter(x => indOn.has(`${p.key}|${x.tid}`)).forEach(x =>
      ds.push({ label: "", endLabel: `${p.label.slice(2)} ${x.t.name}`, data: labels.map(r => val(x, r) ?? null), borderColor: css(`--rf${k}`), borderWidth: 1.5,
        borderDash: [[], [8, 4], [2, 3], [10, 3, 2, 3], [1, 4], [12, 2]][si % 6], pointRadius: 0, tension: 0, order: 2 })));
  }
  const c0 = css("--c0");
  ds.push({ label: `${pace.label} ${idx.teams[club]}（選択中）`, data: labels.map(r => (r <= pace.through ? pace.by[r - 1][f] : null)), borderColor: c0, backgroundColor: c0,
    borderWidth: 3.5, pointRadius: 0, tension: 0, order: 0 }); // 選択クラブ=一番太い青線(丸印はなし)
  charts.chPace = new Chart($("#chPace"), { type: "line", plugins: [cursor, endLabels], data: { labels, datasets: ds }, options: scaleOpts(f) });
  $("#paceLegend").innerHTML = `<div>分け方: <b>${paceMode === "at" ? `第${round}節時点の順位` : "最終順位"}</b></div><div>太い青線＝選んだクラブ（今季）</div><div>太い破線＝過去の該当クラブの平均</div><div>枠の数字＝順位 ／ 細線＝個別クラブ</div><div>34節制のシーズンは34節まで</div>`;
}

function hideTips() {
  for (const c of Object.values(charts)) {
    if (!c.tooltip.getActiveElements().length) continue;
    c.setActiveElements([]);
    c.tooltip.setActiveElements([], { x: 0, y: 0 });
    c.update("none");
  }
}

init();
