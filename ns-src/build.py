# ใส่ app.min.js (จาก npm run build) ลงหน้าร้านลาบ index.html และหน้าร้านก๋วยเตี๋ยว ns/index.html — ใช้โค้ดชุดเดียวกัน
# ใช้: npm run build && python3 ns-src/build.py
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
js = (root / "app.min.js").read_text(encoding="utf-8").strip()
assert "</script" not in js
def put(html):
    i = html.index("<script>") + len("<script>"); j = html.index("</script></body>", i)
    return html[:i] + js + html[j:]
laab = put((root / "index.html").read_text(encoding="utf-8"))
(root / "index.html").write_text(laab, encoding="utf-8")
ns = laab
for a, b in [('content="ร้านลาบ LS"', 'content="ก๋วยเตี๋ยว NS"'),
             ("<title>ร้านอีสาน/ลาบ — บันทึกรายวัน (LS)</title>", "<title>ร้านก๋วยเตี๋ยว — บันทึกรายวัน (NS)</title>"),
             ("%E0%B8%A5%3C/text", "%E0%B8%81%3C/text"),   # ไอคอน ล → ก
             ("<body>\n", '<body>\n<script>window.LAAB_ENTITY="NS"</script>\n')]:
    assert ns.count(a) == 1, a
    ns = ns.replace(a, b)
(root / "ns").mkdir(exist_ok=True)
(root / "ns" / "index.html").write_text(ns, encoding="utf-8")
print("index.html + ns/index.html", len(js))
