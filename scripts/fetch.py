"""Jリーグ公式データサイト -> data/*.json.  標準ライブラリのみ・APIキー不要。

  python scripts/fetch.py                                 # 今季のみ更新
  python scripts/fetch.py --seasons 2021 2022 2023        # 過去シーズン一括取得
"""
# Copyright (c) 2026 pokiwo22. All rights reserved. 無断転載・複製・商用利用禁止(LICENSE参照)
import argparse, glob, json, os, re, sys, time, unicodedata, urllib.request
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")


def label(y):
    return f"{y}/{str(y + 1)[2:]}" if y >= 2026 else str(y)


def current_season(today=None):
    t = today or datetime.now()
    return t.year if t.month >= 8 else t.year - 1


URL = "https://data.j-league.or.jp/SFMS01/search?competition_years={y}&competition_frame_ids={f}"
FRAME = {"J1": 1, "J2": 2}


def fetch_rows(season, league):
    """Jリーグ公式データサイトの日程・結果(静的HTML)をパースして試合dictのリストにする。"""
    req = urllib.request.Request(URL.format(y=season, f=FRAME[league]), headers={"User-Agent": "jleague-compare/1.0 (personal project)"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    rows, slug = [], {}  # 古いシーズンはホーム側にしかクラブリンクが無いので、同ページ内の 名前->slug で補完する
    for tr in html.split("<tr")[1:]:
        m = re.search(r"第([０-９0-9]+)節", tr)
        if not m:
            continue
        d = re.search(r"(\d\d)/(\d\d)/(\d\d)", tr)
        cells = [c for c in re.split(r"<td[^>]*>", tr)[1:]]
        i = next((i for i, c in enumerate(cells) if "match_card_id" in c or re.search(r">\s*vs\s*<|^\s*vs\s*<", c)), None)
        if not d or i is None:
            sys.exit(f"想定外の行(サイト構造が変わった?): {season} {league} {tr[:200]!r}")
        team = []
        for c in (cells[i - 1], cells[i + 1]):
            nm = re.sub(r"<[^>]*>|\s", "", c)
            sl = re.search(r"club/(\w+)/profile", c)
            if sl:
                slug[nm] = sl[1]
            team.append(nm)
        sc = re.search(r"(\d+)-(\d+)", re.sub(r"<[^>]*>", "", cells[i]))
        rows.append({"r": int(unicodedata.normalize("NFKC", m.group(1))), "date": f"20{d[1]}-{d[2]}-{d[3]}",
                     "h": team[0], "a": team[1], "gh": int(sc[1]) if sc else None, "ga": int(sc[2]) if sc else None,
                     "id": (re.search(r"match_card_id=(\d+)", cells[i]) or [None, None])[1]})
    for x in rows:
        for k in "ha":
            x[k] = (slug.get(x[k], x[k]), x[k])
    return rows


CARD = "https://data.j-league.or.jp/SFMS02/?match_card_id={}"
CARDS = {}


def fmt(n):
    n = n.strip()
    return re.sub(r"[ 　]+", "・", n) if re.fullmatch(r"[゠-ヿー・ 　]+", n) else re.sub(r"[ 　]+", "", n)


def card_mgr(mid, home):
    """試合記録ページ -> その試合のホーム/アウェイ監督名。"""
    if mid not in CARDS:
        time.sleep(1)
        req = urllib.request.Request(CARD.format(mid), headers={"User-Agent": "jleague-compare/1.0 (personal project)"})
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
        blocks = re.findall(r"監督情報エリア　Start(.*?)監督情報エリア　End", html, re.S)  # 監督欄が空の試合もある
        if len(blocks) != 2:
            raise ValueError(f"監督欄を取得できない: {mid}")
        CARDS[mid] = [fmt((re.search(r'<td class="name">\s*([^<]*?)\s*</td>', b) or [0, ""])[1]) for b in blocks]
    return CARDS[mid][0 if home else 1]


def attach_managers(d, rows, prev):
    """各クラブの監督の変遷 mgr=[{r:その監督の最初の節, n:名前}] を付ける。
    全試合は引かず、確認済みの最後の試合と最新試合を比べ、違えば二分探索で交代点を探す(1試合=1リクエスト)。
    失敗しても点数データは更新したいので、クラブ単位で握りつぶして前回値を残す。"""
    games = {}
    for x in sorted(rows, key=lambda x: (x["date"], x["r"])):
        if x["gh"] is not None and x["id"]:
            games.setdefault(x["h"][0], []).append((x["r"], x["id"], True))
            games.setdefault(x["a"][0], []).append((x["r"], x["id"], False))
    for tid, g in games.items():
        old = ((prev or {}).get("teams") or {}).get(tid, {})
        mgr, thru = [dict(m) for m in old.get("mgr", [])], old.get("mgrThru", 0)

        def at(i):  # 監督欄が空の試合は隣の試合で代用
            for k in (0, -1, 1, -2, 2):
                if 0 <= i + k < len(g) and (n := card_mgr(g[i + k][1], g[i + k][2])):
                    return n
            raise ValueError("監督名が取れない")

        def seg(lo, mlo, hi, mhi):
            if mlo == mhi:
                return
            if hi - lo == 1:
                mgr.append({"r": g[hi][0], "n": mhi})
                return
            mid = (lo + hi) // 2
            mm = at(mid)
            seg(lo, mlo, mid, mm)
            seg(mid, mm, hi, mhi)

        try:
            if not mgr:
                mgr, thru = [{"r": 1, "n": at(0)}], 1
            if len(g) > thru:
                seg(thru - 1, mgr[-1]["n"], len(g) - 1, at(len(g) - 1))
                thru = len(g)
        except Exception as e:
            print(f"warn: 監督取得失敗 {d['key']} {d['league']} {tid}: {e}", file=sys.stderr)
            mgr, thru = [dict(m) for m in old.get("mgr", [])], old.get("mgrThru", 0)
        if mgr:
            d["teams"][tid]["mgr"], d["teams"][tid]["mgrThru"] = mgr, thru


SRT = "https://data.j-league.or.jp/SFRT01/"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jleague-compare/1.0 (personal project)"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8")


def comp_id(season, league):
    pat = "Ｊ１リーグ" if league == "J1" else "Ｊ２リーグ"
    opts = re.findall(r'<option value="(\d+)"[^>]*>([^<]*)', get(SRT + f"?yearId={season}"))
    return next(v for v, t in opts if t.strip().endswith(pat) and "昇格" not in t and "入" not in t)


def fetch_table(season, cid, n):
    """公式の「第n節終了時点の順位表」。延期試合は消化されるまで加算されない(公式の定義そのまま)。"""
    html = get(SRT + f"search?yearId={season}&competitionId={cid}&competitionSectionId={n}")
    out = []
    for tr in html.split("<tr")[1:]:
        if "icon-graph" not in tr:
            continue
        c = [re.sub(r"<[^>]*>|&nbsp;|\s", "", x) for x in re.split(r"<td[^>]*>", tr)[1:]]  # 位置固定: [グラフ,順位,名前,勝点,試合,勝,分,敗,得点,失点,差]
        sl = re.search(r"club/(\w+)/profile", tr)
        v = [int(unicodedata.normalize("NFKC", x).replace("+", "").replace("−", "-")) for x in c[3:11]]
        out.append({"slug": sl[1] if sl else None, "name": c[2], "rank": int(c[1]) if c[1].isdigit() else None,  # 未消化クラブは順位欄が空
                    "points": v[0], "played": v[1], "w": v[2], "d": v[3], "l": v[4], "gf": v[5], "ga": v[6], "gd": v[7]})
    return out


def apply_official(d, season, league, prev):
    """各節の「延期・未消化の試合数」だけ公式の節別順位表から取る(数値自体は延期試合も本来の節に数える)。
    pending = n - (公式の第n節終了時点の試合数)。確定済みの古い節は前回値を再利用。"""
    cid, through, known, ids = comp_id(season, league), d["through"], {}, set(d["teams"])
    pt = (prev or {}).get("teams") or {}
    reuse = bool(prev) and (prev.get("pendSrc") == "official" or all("rank" in b for t in pt.values() for b in t["byRound"]))
    for n in range(1, through + 1):
        if reuse and n < through - 1 and all(len(t["byRound"]) >= n for t in pt.values()) and set(pt) == ids:
            for tid, t in d["teams"].items():
                t["byRound"][n - 1]["pending"] = pt[tid]["byRound"][n - 1]["pending"]
            continue
        time.sleep(1)
        m, todo = {}, []
        for r in fetch_table(season, cid, n):
            key = r["slug"] or r["name"]
            tid = key if key in ids else known.get(key) or next((i for i in ids if not i.isascii() and i in r["name"]), None)
            if tid is None:
                todo.append(r)
                continue
            known[key] = tid
            m[tid] = r
        left = ids - set(m)  # リンク無し等で対応付けできなかった1クラブは、残った1クラブと対応させる
        if len(todo) == 1 and len(left) == 1:
            tid = left.pop()
            known[todo[0]["slug"] or todo[0]["name"]] = tid
            m[tid] = todo.pop()
        if todo or set(m) != ids:
            raise ValueError(f"{season} {league} 第{n}節: クラブを対応付けできない {[r['name'] for r in todo]}")
        for tid, r in m.items():
            d["teams"][tid]["byRound"][n - 1]["pending"] = max(0, n - r["played"])
    d["pendSrc"] = "official"


def build(rows, season, league):
    """試合rows -> 保存用dict。未消化かつ日付が過去のものを pending とする。"""
    today = datetime.now().strftime("%Y-%m-%d")
    names, ms, rounds, through = {}, {}, 0, 0
    for x in rows:
        fin = x["gh"] is not None
        pend = not fin and x["date"] < today
        rounds = max(rounds, x["r"])
        if fin:
            through = max(through, x["r"])
        for (tid, nm), opp, home, gf, gg in (
                (x["h"], x["a"][0], 1, x["gh"], x["ga"]), (x["a"], x["h"][0], 0, x["ga"], x["gh"])):
            names[tid] = nm
            ms.setdefault(tid, []).append((x["r"], fin, gf, gg, pend, opp, home))
    teams = {}
    for tid, lst in ms.items():
        by = []
        for n in range(1, rounds + 1):
            done = [x for x in lst if x[0] <= n and x[1]]
            w = sum(x[2] > x[3] for x in done)
            d = sum(x[2] == x[3] for x in done)
            gf = sum(x[2] for x in done)
            ga = sum(x[3] for x in done)
            by.append({"round": n, "played": len(done), "points": 3 * w + d, "w": w, "d": d,
                       "l": len(done) - w - d, "gf": gf, "ga": ga, "gd": gf - ga,
                       "pending": sum(1 for x in lst if x[0] <= n and x[4])})
        # 各試合: [節, 相手ID, ホーム=1/アウェイ=0, 得点, 失点](未消化は 得点/失点=null)。画面の「対戦相手の順位と結果」用
        teams[tid] = {"name": names[tid], "byRound": by,
                      "matches": sorted([[x[0], x[5], x[6], x[2], x[3]] for x in lst], key=lambda m: m[0])}  # 未消化は得点/失点が null
    return {"season": label(season), "key": str(season), "league": league, "rounds": rounds,
            "through": through, "teams": teams}


def dump(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def write_all(results):
    """全件成功後にだけ呼ぶ。内容が変わったファイルだけ書く。変更があれば True。"""
    changed = False
    for d in results:
        p = os.path.join(DATA, f"{d['key']}_{d['league']}.json")
        if os.path.exists(p) and open(p, encoding="utf-8").read() == dump(d):
            continue
        open(p, "w", encoding="utf-8").write(dump(d))
        changed = True
    return rebuild_index(changed)


def rebuild_index(touched):
    seasons, teams = {}, {}
    for p in sorted(glob.glob(os.path.join(DATA, "*_J[12].json"))):
        d = json.load(open(p, encoding="utf-8"))
        s = seasons.setdefault(d["key"], {"key": d["key"], "label": d["season"], "leagues": {}})
        s["leagues"][d["league"]] = sorted(d["teams"])
        for tid, t in d["teams"].items():
            teams[tid] = t["name"]
    ip = os.path.join(DATA, "index.json")
    old = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {}
    idx = {"seasons": sorted(seasons.values(), key=lambda s: s["key"], reverse=True), "teams": teams,
           "updated": old.get("updated")}
    if not touched and old and {**old, "updated": None} == {**idx, "updated": None}:
        return False
    idx["updated"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    open(ip, "w", encoding="utf-8").write(dump(idx))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int)
    a = ap.parse_args()
    seasons = a.seasons or [current_season()]
    for p in glob.glob(os.path.join(DATA, "*.json")):  # サンプルデータ掃除
        if '"sample":true' in open(p, encoding="utf-8").read(200):
            os.remove(p)
    changed = False
    for s in seasons:
        results = []
        for name in FRAME:
            time.sleep(2)  # 公式サイトに優しく
            rows = fetch_rows(s, name)
            if not rows:
                sys.exit(f"{name} {s}: 試合が0件。シーズン指定/サイト構造を確認")
            d = build(rows, s, name)
            p = os.path.join(DATA, f"{s}_{name}.json")
            prev = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
            apply_official(d, s, name, prev)
            attach_managers(d, rows, prev)
            results.append(d)
        changed |= write_all(results)  # シーズンごとに保存(長い一括取得の途中失敗に備える)
    print("changed" if changed else "no change")


if __name__ == "__main__":
    main()
