#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_cover.py — 生成封面图（标题+副标题烧到封面底图上）

封面和内容图是两套东西：
  · 内容图：走 `burn_subtitles.py`，一帧一句小字幕
  · 封面图：走本脚本，**大标题 + 副标题**，一眼看出这组讲什么

用法：
  python scripts/make_cover.py <项目目录>
  python scripts/make_cover.py <项目目录> --image out/00_cover.png
  python scripts/make_cover.py <项目目录> --title "深山禁寺" --subtitle "父亲失踪三年后…"

输入：
  · prompts.json 的 meta.cover = {"title": "...", "subtitle": "..."}
    （没写就退回 meta.title 当标题）
  · 封面底图：out/ 下以 00 开头的图；找不到就用 --image 指定
输出：
  · out/subtitled/00_封面.png
"""
import argparse
import glob
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("[ERROR] 缺少 Pillow，请 pip install pillow")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from burn_subtitles import find_font, wrap_text, NO_LINE_START  # noqa: E402


def render_cover(img, title, subtitle, font_path, args):
    img = img.convert("RGBA")
    W, H = img.size

    t_size = max(28, int(W * args.title_ratio))
    s_size = max(16, int(W * args.subtitle_ratio))
    f_title = ImageFont.truetype(font_path, t_size)
    f_sub = ImageFont.truetype(font_path, s_size)
    for f, w in ((f_title, args.title_weight), (f_sub, args.subtitle_weight)):
        try:
            f.set_variation_by_name(w)
        except Exception:
            pass

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # 标题：按字数均衡切 2 行（绝不"3+4"这种丑断），再按最长行自动定字号
    max_w = int(W * 0.86)
    nm = len(title)
    if nm <= 6:
        t_lines = [title]
    else:
        # 在中间附近找断点，优先断在虚词/标点之后
        best, best_score = nm // 2, 1e9
        for k in range(max(1, nm // 2 - 2), min(nm - 1, nm // 2 + 3)):
            score = abs(len(title[:k]) - len(title[k:]))
            if title[k - 1] in "的在后是为着了，、":
                score -= 1.5
            if score < best_score:
                best_score, best = score, k
        t_lines = [title[:best], title[best:]]

    # 按最长行定字号（从 target 往下缩，直到两行都能放进 86% 宽）
    t_size = max(26, int(W * args.title_ratio))
    while t_size > 26:
        f_title = ImageFont.truetype(font_path, t_size)
        try:
            f_title.set_variation_by_name(args.title_weight)
        except Exception:
            pass
        if max(d.textbbox((0, 0), ln, font=f_title)[2] for ln in t_lines) <= max_w:
            break
        t_size = int(t_size * 0.94)
    s_lines = wrap_text(subtitle, f_sub, max_w, d)[:3] if subtitle else []

    t_lh = int(t_size * 1.22)
    s_lh = int(s_size * 1.5)
    t_w = max((d.textbbox((0, 0), l, font=f_title)[2] for l in t_lines), default=0)
    s_w = max((d.textbbox((0, 0), l, font=f_sub)[2] for l in s_lines), default=0)
    block_w = max(t_w, s_w)
    block_h = t_lh * len(t_lines) + (int(s_size * 0.7) + s_lh * len(s_lines) if s_lines else 0)

    pad_x, pad_y = int(W * 0.045), int(W * 0.035)
    box_w, box_h = block_w + pad_x * 2, block_h + pad_y * 2
    x0 = (W - box_w) // 2
    y0 = int(H * args.y) - box_h // 2
    y0 = max(int(H * 0.04), min(y0, H - box_h - int(H * 0.04)))

    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h],
                        radius=int(W * 0.018), fill=(0, 0, 0, args.alpha))

    y = y0 + pad_y
    for line in t_lines:
        lw = d.textbbox((0, 0), line, font=f_title)[2]
        d.text((x0 + (box_w - lw) // 2, y), line, font=f_title, fill=(255, 255, 255, 250))
        y += t_lh
    if s_lines:
        y += int(s_size * 0.7)
        for line in s_lines:
            lw = d.textbbox((0, 0), line, font=f_sub)[2]
            d.text((x0 + (box_w - lw) // 2, y), line, font=f_sub, fill=(235, 238, 242, 225))
            y += s_lh

    return Image.alpha_composite(img, overlay).convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--image", default=None, help="封面底图路径（默认找 out/00_*）")
    ap.add_argument("--title", default=None)
    ap.add_argument("--subtitle", default=None)
    ap.add_argument("--font", default=None)
    ap.add_argument("--title-weight", default="Black")
    ap.add_argument("--subtitle-weight", default="Medium")
    ap.add_argument("--title-ratio", type=float, default=0.105, help="标题字号=画面宽×该值")
    ap.add_argument("--subtitle-ratio", type=float, default=0.042)
    ap.add_argument("--alpha", type=int, default=115)
    ap.add_argument("--y", type=float, default=0.33, help="文字块中心高度比例")
    args = ap.parse_args()

    proj = os.path.abspath(args.dir)
    pj = os.path.join(proj, "prompts.json")
    if not os.path.exists(pj):
        sys.exit(f"[ERROR] 找不到 {pj}，先跑 gen_pack.mjs")
    data = json.load(open(pj, encoding="utf-8"))
    meta = data.get("meta", {})
    cover = meta.get("cover") or {}
    title = args.title or cover.get("title") or meta.get("title") or "未命名"
    subtitle = args.subtitle if args.subtitle is not None else (cover.get("subtitle") or "")

    # 找封面底图
    src = args.image
    if src and not os.path.isabs(src):
        src = os.path.join(proj, src)
    if not src or not os.path.exists(src):
        exts = ("png", "jpg", "jpeg", "webp")
        def _pick(prefix):
            out = []
            for e in exts:
                out += glob.glob(os.path.join(proj, "out", f"{prefix}*.{e}"))
            return [x for x in out if os.path.isfile(x)]

        cands = _pick("00")
        if not cands:
            # 兜底 1：用定价帧（hero_frame）当封面底图
            hero = str(meta.get("hero_frame") or "").zfill(2)
            if hero and hero != "00":
                cands = _pick(hero)
                if cands:
                    print(f"[提示] 没有 00 封面帧，改用定价帧 {hero} 作封面底图")
        if not cands:
            # 兜底 2：用 out/ 里第一张图
            allimg = []
            for e in exts:
                allimg += glob.glob(os.path.join(proj, "out", f"*.{e}"))
            allimg = sorted(x for x in allimg if os.path.isfile(x))
            if allimg:
                cands = allimg[:1]
                print(f"[提示] 没有封面帧，改用 {os.path.basename(cands[0])} 作封面底图")
        if not cands:
            sys.exit("[ERROR] out/ 里没有任何图片，无法生成封面。先出图。")
        src = sorted(cands)[0]

    font_path = find_font(args.font)
    img = Image.open(src)
    out = render_cover(img, title, subtitle, font_path, args)

    out_dir = os.path.join(proj, "out", "subtitled")
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, "00_封面.png")
    out.save(dst, quality=95)

    print(f"封面底图：{os.path.basename(src)}")
    print(f"标题：{title}")
    if subtitle:
        print(f"副标题：{subtitle}")
    print(f"字体：{font_path}  字重：{args.title_weight}/{args.subtitle_weight}")
    print(f"✓ 封面已生成：{dst}")


if __name__ == "__main__":
    main()
