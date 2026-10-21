const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");

let urlTimer, refs = new Set(["1"]), paceOff = new Set(), indOff = new Set(), pace = null, idx, club, picked = [], round = 1, S = [], charts = {};
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
  indOff = new Set((q.get("off") || "").split(",").filter(Boolean));
  $("#refs").onchange = e => { // 入れ子のチェック(種類 / 個別クラブ)を1か所で処理
    const i = e.target;
    if (i.dataset.ind) i.checked ? indOff.delete(i.dataset.ind) : indOff.add(i.dataset.ind);
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
  $("#seasonsSum").textContent = "比較シーズン: " + (idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club)).map(s => s.label).join(" / ") || "未選択");
  const keys = idx.seasons.filter(s => picked.includes(s.key) && leagueOf(s, club));
  S = (await Promise.all(keys.map(async s => {
    const lg = leagueOf(s, club), d = await load(s.key, lg), t = d?.teams[club];
    return t && { key: s.key, label: s.label, lg, rounds: d.rounds, through: d.through, by: t.byRound, all: d.teams, mgr: t.mgr || [] };
  }))).filter(Boolean);
  const max = Math.max(1, ...S.map(s => s.rounds));
  $("#round").max = max;
  if (!round) round = Math.max(1, ...S.filter(s => s.key === idx.seasons[0].key).map(s => s.through), 1);
  setRound(round);
  await loadPace();
  draw();
  mgrLegend();
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
  urlTimer = setTimeout(() => history.replaceState(null, "", "?" + new URLSearchParams({ club, seasons: picked.join(","), round, m: $("#metric").value, ref: [...refs].join(","), ...(indOff.size ? { off: [...indOff].join(",") } : {}) })), 250);
  cards();
  Object.values(charts).forEach(moveCursor); // グラフ全再描画はせず、縦線(DOM)を動かすだけ
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
    const sub = refs.has(k) ? '<div class="sub">' + inc.map(p => `<div class="row2"><b>${p.label}</b>` +
      p.cat[k].map(x => `<label><input type="checkbox" data-ind="${p.key}|${x.tid}" ${indOff.has(`${p.key}|${x.tid}`) ? "" : "checked"}>${x.t.name}</label>`).join("") + "</div>").join("") + "</div>" : "";
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
  charts.chPace?.destroy();
  delete charts.chPace;
  const box = $("#paceSec .box");
  if (!pace || !pace.past.length) { $("#paceLegend").textContent = pace ? "比較できる過去シーズン（確定済みで同じ節数）がありません。" : ""; box.style.display = "none"; return; }
  box.style.display = "";
  const f = $("#metric").value, labels = Array.from({ length: pace.rounds }, (_, i) => i + 1);
  const inc = pace.past.filter(p => !paceOff.has(p.key)), ds = [];
  const val = (x, r) => x.t.byRound[r - 1]?.[f]; // 節数が少ないシーズンは、その節以降なし
  for (const k of Object.keys(REF).filter(k => refs.has(k))) {
    inc.forEach((p, si) => p.cat[k].filter(x => !indOff.has(`${p.key}|${x.tid}`)).forEach(x =>
      ds.push({ label: "", endLabel: `${p.label.slice(2)} ${x.t.name}`, data: labels.map(r => val(x, r) ?? null), borderColor: css(`--rf${k}`), borderWidth: 1.5,
        borderDash: [[], [8, 4], [2, 3], [10, 3, 2, 3], [1, 4], [12, 2]][si % 6], pointRadius: 0, tension: 0, order: 2 })));
  }
  const c0 = css("--c0");
  ds.push({ label: `${pace.label} ${idx.teams[club]}（選択中）`, data: labels.map(r => (r <= pace.through ? pace.by[r - 1][f] : null)), borderColor: c0, backgroundColor: c0,
    borderWidth: 3, pointRadius: 3.5, pointBorderColor: c0, pointBackgroundColor: css("--card"), pointBorderWidth: 1.5, tension: 0, order: 0 }); // 丸印つきの太線
  charts.chPace = new Chart($("#chPace"), { type: "line", plugins: [cursor, endLabels], data: { labels, datasets: ds }, options: scaleOpts(f) });
  const rows = inc.map(p => `<div><b>${p.label}</b> ` + Object.keys(REF).filter(k => refs.has(k)).map(k => `<span class="ml">${REF[k]} ${p.cat[k].map(x => x.t.name).join("・")}</span>`).join(" ") + "</div>").join("");
  $("#paceLegend").innerHTML = "<div>丸付きの太線＝選択中のクラブ（今季）／ 細線＝過去シーズンの該当クラブ（色＝順位の種類、線の種類＝シーズン、線の端にシーズン下2桁とクラブ名）。34節制のシーズンは34節まで。</div>" + rows;
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
