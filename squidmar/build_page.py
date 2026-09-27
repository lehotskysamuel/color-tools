"""Render colors.json into a swatch sheet (index.html).

    python build_page.py                   # full standalone page -> index.html
    python build_page.py --fragment OUT    # body-only variant for hosts that add their own <head>
"""
import argparse
import html
import json
from pathlib import Path

HERE = Path(__file__).parent

HEAD = """<title>Squidmar Paint Swatches</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans+Condensed:wght@400;500;800&family=Lato:wght@400;900&display=swap">
<style>
  :root {
    color-scheme: dark;
    --ground: #000000;
    --ink: #f3f0ea;
    --muted: #8e8981;
    --rule: #26231f;
    --edge: rgba(255, 255, 255, 0.14);
    --focus: #f4c542;
    --display: "Fira Sans Condensed", "Arial Narrow", "Roboto Condensed", sans-serif;
    --figure: "Lato", "Helvetica Neue", Arial, sans-serif;
  }
  html, body { background: var(--ground); color: var(--ink); }
  body { font-family: var(--display); font-size: 15px; line-height: 1.4; }
  .page { max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 40px 64px; }

  header { display: grid; gap: 10px; margin-bottom: 44px; }
  .eyebrow { font-family: var(--figure); font-weight: 900; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0; }
  h1 { font-weight: 800; font-size: clamp(34px, 6vw, 56px); line-height: 1; letter-spacing: -0.01em; margin: 0; text-wrap: balance; }
  .lede { max-width: 62ch; color: var(--muted); margin: 0; font-size: 16px; }

  section + section { margin-top: 56px; }
  .sheet-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 1px solid var(--rule); }
  h2 { font-weight: 800; font-size: 30px; line-height: 1.1; margin: 0; }
  .sheet-meta { display: flex; align-items: baseline; gap: 16px; color: var(--muted); font-family: var(--figure); font-size: 13px; }
  .copy-list { font: inherit; color: var(--ink); background: none; border: 1px solid var(--edge); border-radius: 3px; padding: 4px 10px; cursor: pointer; }
  .copy-list:hover { border-color: var(--muted); }

  .grid { --cols: 6; display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 26px 16px; margin: 0; padding: 0; list-style: none; }
  .grid[data-cols="5"] { --cols: 5; gap: 28px 20px; }

  .paint { display: grid; gap: 3px; width: 100%; padding: 0; text-align: left; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .chip { display: block; aspect-ratio: 1; max-width: 100%; background: var(--c); border-radius: 2px; box-shadow: inset 0 0 0 1px var(--edge); margin-bottom: 7px; transition: transform 120ms ease; }
  .paint:hover .chip { transform: translateY(-2px); }
  .paint:focus-visible { outline: none; }
  .paint:focus-visible .chip { box-shadow: 0 0 0 2px var(--ground), 0 0 0 4px var(--focus); }
  .code { font-family: var(--figure); font-weight: 900; font-size: 17px; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .name { font-weight: 500; font-size: 16px; line-height: 1.2; }
  .val { font-family: var(--figure); font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; gap: 0 8px; }
  .tag { text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; font-weight: 900; color: var(--ink); opacity: 0.75; }

  .note { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--rule); color: var(--muted); font-size: 14px; max-width: 70ch; }

  .toast { position: fixed; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--ground); font-family: var(--figure); font-size: 14px; padding: 8px 14px; border-radius: 3px; }

  @media (max-width: 760px) {
    .grid, .grid[data-cols="5"] { --cols: 3; gap: 22px 14px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip { transition: none; }
    .paint:hover .chip { transform: none; }
  }
</style>
"""

SCRIPT = """<script>
  (function () {
    var toast = document.getElementById('toast');
    var timer;
    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { toast.hidden = true; }, 1800);
    }
    function copy(text, done) {
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        say(ok ? done : 'Copying is blocked here. Select the text on the page instead.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { say(done); }, fallback);
      } else {
        fallback();
      }
    }
    document.addEventListener('click', function (e) {
      var paint = e.target.closest('.paint');
      if (paint) {
        copy(paint.dataset.hex, 'Copied ' + paint.dataset.hex + ' (' + paint.dataset.name + ')');
        return;
      }
      var btn = e.target.closest('.copy-list');
      if (btn) {
        var rows = Array.prototype.map.call(
          document.querySelectorAll('#' + btn.dataset.sheet + ' .paint'),
          function (p) { return [p.dataset.code, p.dataset.name, p.dataset.rgb, p.dataset.hex].join('\\t'); }
        );
        copy(rows.join('\\n'), 'Copied ' + rows.length + ' paints as tab-separated text');
      }
    });
  })();
</script>
"""


def tile(p):
    r, g, b = p["rgb"]
    esc = html.escape
    tag = '<span class="tag">Metallic</span>' if p["metallic"] else ""
    return (
        f'<li><button type="button" class="paint" style="--c:{p["hex"]}" '
        f'data-code="{esc(p["code"])}" data-name="{esc(p["name"])}" data-rgb="{r},{g},{b}" data-hex="{p["hex"]}" '
        f'aria-label="{esc(p["code"])} {esc(p["name"])}, RGB {r} {g} {b}. Copy hex">'
        f'<span class="chip"></span>'
        f'<span class="code">{esc(p["code"])}</span>'
        f'<span class="name">{esc(p["name"])}</span>'
        f'<span class="val"><span>RGB {r} {g} {b}</span><span>{p["hex"]}</span>{tag}</span>'
        f"</button></li>"
    )


def body(sheets):
    unique = {p["code"] for s in sheets for p in s["paints"]}
    parts = [
        '<main class="page">',
        "<header>",
        '<p class="eyebrow">Squidmar Color &middot; 74.2xx acrylics</p>',
        "<h1>Squidmar Paint Swatches</h1>",
        f'<p class="lede">Every paint from the two release sheets, {len(unique)} unique colors, '
        "laid out in the same order as the originals. Click a swatch to copy its hex code.</p>",
        "</header>",
    ]
    for s in sheets:
        sid = f"sheet-{s['id']}"
        rows = len(s["paints"]) // s["columns"]
        parts += [
            f'<section id="{sid}" aria-labelledby="{sid}-title">',
            '<div class="sheet-head">',
            f'<h2 id="{sid}-title">{html.escape(s["title"])}</h2>',
            f'<div class="sheet-meta"><span>{s["columns"]} &times; {rows} grid, same order as the sheet</span>'
            f'<button type="button" class="copy-list" data-sheet="{sid}">Copy list</button></div>',
            "</div>",
            f'<ul class="grid" data-cols="{s["columns"]}">',
            *(tile(p) for p in s["paints"]),
            "</ul>",
            "</section>",
        ]
    parts += [
        '<p class="note">RGB values were sampled from the compressed promo images, so treat them as '
        "close screen matches, not official manufacturer data. Paints that appear on both sheets agree "
        "within a few RGB units. Metallics are drawn as gradients in the source; their square shows the "
        "dominant mid-tone.</p>",
        "</main>",
        '<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>',
    ]
    return "\n".join(parts) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fragment", type=Path, help="write a body-only variant here instead of index.html")
    args = ap.parse_args()

    sheets = json.loads((HERE / "colors.json").read_text(encoding="utf-8"))
    content = HEAD + body(sheets) + SCRIPT
    if args.fragment:
        args.fragment.write_text(content, encoding="utf-8")
    else:
        page = (
            '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + HEAD + "</head>\n<body>\n" + body(sheets) + SCRIPT + "</body>\n</html>\n"
        )
        (HERE / "index.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
