const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");

let urlTimer, refs = new Set(), paceOff = new Set(), rkMode = "at", zooms = [], indOn = new Set(), avgOff = new Set(), pace = null, idx, club, picked = [], round = 1, S = [], charts = {};
const files = {};

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
  if (q.has("ref")) refs = new Set(q.get("ref").split(",").filter(Boolean));
  indOn = new Set((q.get("ind") || "").split(",").filter(Boolean));
  rkMode = q.get("rk") === "final" ? "final" : "at";
  document.querySelectorAll('#zoomCtl input[name="zrk"]').forEach(i => {
    i.checked = i.value === rkMode;
    i.onchange = () => { rkMode = i.value; updateZoom(); setRound(round); };
  });
  avgOff = new Set((q.get("avgoff") || "").split(",").filter(Boolean));
  $("#paceBox").ontoggle = () => drawPace();
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
  $("#seasonsSum").textContent = `${idx.teams[club]}（${$("#league").value}） ｜ ` + (idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club)).map(s => s.label).join("・") || "シーズン未選択");
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
  drawZoom();
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
  urlTimer = setTimeout(() => history.replaceState(null, "", "?" + new URLSearchParams({ club, seasons: picked.join(","), round, m: $("#metric").value, ref: [...refs].join(","), ...(indOn.size ? { ind: [...indOn].join(",") } : {}), ...(avgOff.size ? { avgoff: [...avgOff].join(",") } : {}), ...(rkMode === "final" ? { rk: "final" } : {}) })), 250);
  cards();
  Object.values(charts).forEach(moveCursor); // グラフ全再描画はせず、縦線(DOM)を動かすだけ
  updateZoom();
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
const WIN_HALF = 6;       // 選んだ節の前後6節(計13節)
const RES = { w: "#15803d", d: "#facc15", l: "#b91c1c" };
const rankMap = (s, n) => { // 第n節終了時点の順位(勝点→得失点→総得点)
  s.rk ??= {};
  return s.rk[n] ??= Object.fromEntries(Object.entries(s.all)
    .map(([id, t]) => [id, t.byRound[n - 1]])
    .sort((a, b) => b[1].points - a[1].points || b[1].gd - a[1].gd || b[1].gf - a[1].gf)
    .map(([id], i) => [id, i + 1]));
};
const zoomWindow = s => { // まだ試合のない節を選んだときは、直近の試合のある範囲を出す
  const start = Math.max(1, Math.min(Math.min(round, s.through) - WIN_HALF, s.rounds - 2 * WIN_HALF));
  return [start, Math.min(s.rounds, start + 2 * WIN_HALF)];
};

const zoomMarks = { // 丸(結果色)+数字(相手の順位)+選んだ節の輪と縦線
  id: "zoomMarks",
  afterDatasetsDraw(ch) {
    const z = ch.$z; if (!z?.pts) return; // 作成直後(データ未設定)は描かない
    const c = ch.ctx, { left, right, top, bottom } = ch.chartArea, sx = ch.scales.x, sy = ch.scales.y;
    const R = Math.max(6, Math.min(11, (sx.getPixelForValue(2) - sx.getPixelForValue(1)) / 2 - 1));
    c.save();
    c.beginPath(); c.rect(left - R - 4, top - R - 4, right - left + 2 * R + 8, bottom - top + 2 * R + 8); c.clip();
    const cx = sx.getPixelForValue(round);
    c.strokeStyle = css("--muted"); c.setLineDash([3, 3]); c.lineWidth = 1;
    if (round >= sx.min && round <= sx.max) { c.beginPath(); c.moveTo(cx, top); c.lineTo(cx, bottom); c.stroke(); }
    c.setLineDash([]);
    c.textAlign = "center"; c.textBaseline = "middle"; c.font = `700 ${Math.round(R * 1.05)}px system-ui, sans-serif`;
    for (const p of z.pts) {
      if (p.x < sx.min || p.x > sx.max) continue;
      const x = sx.getPixelForValue(p.x), y = sy.getPixelForValue(p.y);
      c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = RES[p.res]; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = css("--card"); c.stroke();
      c.fillStyle = p.res === "d" ? "#1c1917" : "#fff";
      c.fillText(rkMode === "final" || p.x >= MIN_RANK_ROUND ? (p.rk ?? "—") : "—", x, y + 0.5);
      if (p.x === round) { c.beginPath(); c.arc(x, y, R + 3.5, 0, 7); c.lineWidth = 2.5; c.strokeStyle = css("--fg"); c.stroke(); }
    }
    c.restore();
  },
};

function drawZoom() {
  zooms.forEach(z => z.chart.destroy());
  zooms = [];
  $("#zoomBody").innerHTML = S.map((s, i) => `<div class="zrow"><h4>${s.label}（${s.lg}）</h4><div class="zbox"><canvas id="zc${i}"></canvas></div></div>`).join("");
  const f = $("#metric").value, fg = css("--muted");
  S.forEach((s, i) => {
    const col = css(`--c${i % 6}`), line = [];
    for (let r = 1; r <= s.through; r++) line.push({ x: r, y: s.by[r - 1][f] });
    const chart = new Chart($(`#zc${i}`), {
      type: "line", plugins: [zoomMarks],
      data: { datasets: [{ data: line, borderColor: col, borderWidth: 2, pointRadius: 0, tension: 0 }] },
      options: {
        animation: false, maintainAspectRatio: false, events: [], layout: { padding: { top: 8, bottom: 2 } },
        scales: { x: { type: "linear", ticks: { color: fg, stepSize: 1, callback: v => (Number.isInteger(v) ? v : "") }, grid: { color: css("--line") } },
                  y: { ticks: { color: fg, maxTicksLimit: 4 }, grid: { color: css("--line") } } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    zooms.push({ s, i, chart, f, line });
  });
  updateZoom();
}

function updateZoom() {
  for (const z of zooms) {
    const { s, chart, f, line } = z, [a, b] = zoomWindow(s);
    z.pts = s.matches.map(([r, opp, home, gf, ga]) => ({
      x: r, y: s.by[r - 1]?.[f], res: gf > ga ? "w" : gf < ga ? "l" : "d",
      rk: rkMode === "final" ? rankMap(s, s.through)[opp] : r >= MIN_RANK_ROUND ? rankMap(s, r - 1)[opp] : null,
    })).filter(p => p.y != null);
    chart.$z = z;
    const ys = line.filter(p => p.x >= a && p.x <= b).map(p => p.y);
    const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(2, (hi - lo) * 0.25);
    const sc = chart.options.scales;
    sc.x.min = a - 0.7; sc.x.max = b + 0.7;
    sc.y.min = ys.length ? Math.floor(lo - pad) : 0; sc.y.max = ys.length ? Math.ceil(hi + pad) : 1; // 目盛りが中途半端にならないよう整数に
    chart.update("none");
  }
  const what = rkMode === "final" ? "相手の<b>最終順位</b>（未確定のシーズンは現時点）" : "相手の、その試合の<b>直前</b>の順位（1〜3節は—）";
  $("#zoomNote").innerHTML = `丸の色: <span class="lg w">勝ち</span> <span class="lg d">分け</span> <span class="lg l">負け</span> ／ 丸の中の数字＝${what} ／ 太い輪＝選んだ節 ／ 範囲は選んだ節の前後${WIN_HALF}節`;
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

// ---- ペース比較: 選択クラブの今季 vs 過去の確定シーズンの優勝/2位/3位/下位3クラブ(同じ節数のシーズンのみ) ----
const REF = { 1: "優勝", 2: "2位", 3: "3位", d: "降格圏" };
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
    past.push({ key: s.key, label: s.label, cat: { 1: [L[0]], 2: [L[1]], 3: [L[2]], d: L.slice(-3) } });
  }
  pace = { label: cur.label, lg, by: ct.byRound, through: cd.through, rounds: cd.rounds, past };
  $("#refSeasons").innerHTML = "<span>対象シーズン:</span>" + past.map(p => `<label><input type="checkbox" value="${p.key}" ${paceOff.has(p.key) ? "" : "checked"}>${p.label}</label>`).join("");
  $("#refSeasons").querySelectorAll("input").forEach(i => {
    i.onchange = () => { i.checked ? paceOff.delete(i.value) : paceOff.add(i.value); renderRefs(); drawPace(); };
  });
  renderRefs();
}

// 比較の選択UI: 種類(優勝/2位/3位/降格圏)のチェックの中に、シーズンごとの個別クラブを入れ子で出す
function renderRefs() {
  if (!pace) return void ($("#refs").innerHTML = "");
  const inc = pace.past.filter(p => !paceOff.has(p.key));
  $("#refs").innerHTML = Object.entries(REF).map(([k, name]) => {
    const sub = refs.has(k) ? '<div class="sub">' + `<div class="row2"><b>平均線</b><label><input type="checkbox" data-avg="${k}" ${avgOff.has(k) ? "" : "checked"}>過去${inc.length}シーズンの平均を表示</label></div>` + inc.map(p => `<div class="row2"><b>${p.label}</b>` +
      p.cat[k].map(x => `<label><input type="checkbox" data-ind="${p.key}|${x.tid}" ${indOn.has(`${p.key}|${x.tid}`) ? "checked" : ""}>${x.t.name}</label>`).join("") + "</div>").join("") + "</div>" : "";
    return `<div class="rg"><label class="top"><input type="checkbox" value="${k}" ${refs.has(k) ? "checked" : ""}>${name}${k === "d" ? "3クラブ" : ""}</label>${sub}</div>`;
  }).join("");
}

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
    const xs = inc.flatMap(p => p.cat[k]);
    if (xs.length && !avgOff.has(k)) ds.push({ label: `${REF[k]}クラブの平均`, data: labels.map(r => { const v = xs.map(x => val(x, r)).filter(y => y != null); return v.length ? avg(v) : null; }),
      borderColor: css(`--rf${k}`), borderWidth: 2.5, borderDash: [6, 3], pointRadius: 0, tension: 0, order: 1 });
    inc.forEach((p, si) => p.cat[k].filter(x => indOn.has(`${p.key}|${x.tid}`)).forEach(x =>
      ds.push({ label: "", endLabel: `${p.label.slice(2)} ${x.t.name}`, data: labels.map(r => val(x, r) ?? null), borderColor: css(`--rf${k}`), borderWidth: 1.5,
        borderDash: [[], [8, 4], [2, 3], [10, 3, 2, 3], [1, 4], [12, 2]][si % 6], pointRadius: 0, tension: 0, order: 2 })));
  }
  const c0 = css("--c0");
  ds.push({ label: `${pace.label} ${idx.teams[club]}（選択中）`, data: labels.map(r => (r <= pace.through ? pace.by[r - 1][f] : null)), borderColor: c0, backgroundColor: c0,
    borderWidth: 3.5, pointRadius: 0, tension: 0, order: 0 }); // 選択クラブ=一番太い青線(丸印はなし)
  charts.chPace = new Chart($("#chPace"), { type: "line", plugins: [cursor, endLabels], data: { labels, datasets: ds }, options: scaleOpts(f) });
  const rows = inc.map(p => `<div><b>${p.label}</b> ` + Object.keys(REF).filter(k => refs.has(k)).map(k => `<span class="ml">${REF[k]} ${p.cat[k].map(x => x.t.name).join("・")}</span>`).join(" ") + "</div>").join("");
  $("#paceLegend").innerHTML = "<div>太い青線＝選択中のクラブ（今季）／ 太い破線＝過去シーズンの該当クラブの平均（対象シーズンの全クラブ） ／ 細線＝個別のクラブ（色＝順位の種類、線の種類＝シーズン、線の端にシーズン下2桁とクラブ名）。34節制のシーズンは34節まで。</div>" + rows;
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
