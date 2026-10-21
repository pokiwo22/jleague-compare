"""Jリーグ公式データサイト -> data/*.json.  標準ライブラリのみ・APIキー不要。

  python scripts/fetch.py                                 # 今季のみ更新
  python scripts/fetch.py --seasons 2021 2022 2023        # 過去シーズン一括取得
"""
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
                     "h": team[0], "a": team[1], "gh": int(sc[1]) if sc else None, "ga": int(sc[2]) if sc else None})
    for x in rows:
        for k in "ha":
            x[k] = (slug.get(x[k], x[k]), x[k])
    return rows


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
        for (tid, nm), gf, gg in ((x["h"], x["gh"], x["ga"]), (x["a"], x["ga"], x["gh"])):
            names[tid] = nm
            ms.setdefault(tid, []).append((x["r"], fin, gf, gg, pend))
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
        teams[tid] = {"name": names[tid], "byRound": by}
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
    results = []
    for s in seasons:
        for name in FRAME:
            if results:
                time.sleep(2)  # 公式サイトに優しく
            rows = fetch_rows(s, name)
            if not rows:
                sys.exit(f"{name} {s}: 試合が0件。シーズン指定/サイト構造を確認")
            results.append(build(rows, s, name))
    print("changed" if write_all(results) else "no change")


if __name__ == "__main__":
    main()
