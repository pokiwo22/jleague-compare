const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");

let urlTimer, idx, club, picked = [], round = 1, S = [], charts = {};
const files = {};

const load = (key, lg) => files[key + lg] ??= fetch(`data/${key}_${lg}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
const latest = id => idx.seasons.find(s => s.leagues.J1?.includes(id) || s.leagues.J2?.includes(id));
const leagueOf = (s, id) => (s.leagues.J1?.includes(id) ? "J1" : s.leagues.J2?.includes(id) ? "J2" : null);

async function init() {
  idx = await fetch("data/index.json").then(r => r.json()).catch(() => null);
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
  if (["gd", "gf", "ga"].includes(q.get("m"))) $("#metric").value = q.get("m");
  $("#metric").onchange = () => { draw(); setRound(round); };
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
    return t && { key: s.key, label: s.label, lg, rounds: d.rounds, through: d.through, by: t.byRound, all: d.teams };
  }))).filter(Boolean);
  const max = Math.max(1, ...S.map(s => s.rounds));
  $("#round").max = max;
  if (!round) round = Math.max(1, ...S.filter(s => s.key === idx.seasons[0].key).map(s => s.through), 1);
  setRound(round);
  draw();
}

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
  if (round !== prev) navigator.vibrate?.(8); // Androidのみ(iOS Safariは非対応)
  $("#round").value = round;
  $("#roundOut").textContent = round;
  clearTimeout(urlTimer); // URL更新は操作が止まってから(連続replaceStateは重く、iOSでは制限もある)
  urlTimer = setTimeout(() => history.replaceState(null, "", "?" + new URLSearchParams({ club, seasons: picked.join(","), round, m: $("#metric").value })), 250);
  cards();
  Object.values(charts).forEach(moveCursor); // グラフ全再描画はせず、縦線(DOM)を動かすだけ
}

function cards() {
  const name = k => (k === idx.seasons[0].key ? "今季" : k === idx.seasons[1]?.key ? "昨季" : null);
  $("#cards").innerHTML = S.map((s, i) => {
    const b = at(s, round), c = `var(--c${i % 6})`;
    const head = `<h3>${s.label} <small>${s.lg}${name(s.key) ? " / " + name(s.key) : ""}</small></h3>`;
    if (!b) return `<div class="card" style="--c:${c}">${head}<div class="big">—</div><div class="row">未消化の節</div></div>`;
    const diffs = i === 0 ? S.slice(1).map(o => {
      const x = at(o, round);
      return x ? `<div>${name(o.key) || o.label}比 <span class="${cls(b.points - x.points)}">勝点 ${signed(b.points - x.points)}</span> / <span class="${cls(b.gd - x.gd)}">得失 ${signed(b.gd - x.gd)}</span></div>` : "";
    }).join("") : "";
    return `<div class="card" style="--c:${c}">${head}
      <div class="big">${b.points}<span class="row"> 勝点</span> <span class="rank">${rank(s, round).n}位<span class="row">/${rank(s, round).of}</span></span></div>
      <div class="row">得失点 <b class="${cls(b.gd)}">${signed(b.gd)}</b>（${b.gf}-${b.ga}）</div>
      <div class="row">${b.w}勝 ${b.d}分 ${b.l}敗（${b.played}試合）</div>
      ${b.pending ? `<div class="tag">未消化あり（${b.pending}試合）</div>` : ""}
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

function draw() {
  const max = Math.max(1, ...S.map(s => s.rounds));
  const labels = Array.from({ length: max }, (_, i) => i + 1);
  for (const [id, f] of [["chPts", "points"], ["chGd", $("#metric").value]]) {
    charts[id]?.destroy();
    const grid = css("--line"), fg = css("--muted");
    charts[id] = new Chart($("#" + id), {
      type: "line",
      plugins: [cursor],
      data: {
        labels,
        datasets: S.map((s, i) => ({
          label: `${s.label}（${s.lg}）`,
          data: labels.map(r => at(s, r)?.[f] ?? null),
          borderColor: css(`--c${i % 6}`), backgroundColor: css(`--c${i % 6}`),
          borderWidth: i === 0 ? 3 : 2, pointRadius: 0, pointHoverRadius: 4, tension: 0,
        })),
      },
      options: {
        animation: false, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { title: { display: true, text: "節", color: fg }, ticks: { color: fg, autoSkip: false, maxRotation: 0, callback(v) { const l = this.getLabelForValue(v); return l === 1 || l % 5 === 0 ? l : ""; } }, grid: { color: grid } },
          y: { ticks: { color: fg }, grid: { color: c => (f === "gd" && c.tick.value === 0 ? "#dc2626" : grid), lineWidth: c => (f === "gd" && c.tick.value === 0 ? 2 : 1) } },
        },
        plugins: { legend: { labels: { color: css("--fg"), boxWidth: 14, boxHeight: 3, font: { size: 11 } } } },
      },
    });
    bind($("#" + id));
  }
}

function hideTips() {
  for (const c of Object.values(charts)) {
    if (!c.tooltip.getActiveElements().length) continue;
    c.setActiveElements([]);
    c.tooltip.setActiveElements([], { x: 0, y: 0 });
    c.update("none");
  }
}

function bind(cv) {
  cv.onwheel = e => { e.preventDefault(); setRound(round + (e.deltaY > 0 ? 1 : -1)); };
  let x0, r0;
  cv.ontouchstart = e => { x0 = e.touches[0].clientX; r0 = round; };
  cv.ontouchmove = e => {
    const step = cv.clientWidth / Math.max(1, +$("#round").max);
    setRound(r0 + Math.round((e.touches[0].clientX - x0) / step));
  };
}

init();
