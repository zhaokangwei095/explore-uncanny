#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
burn_subtitles.py — 把 subtitle_zh 真正烧到图上（agent 必须执行这一步）

为什么需要它：生图模型画中文必出乱码，所以字幕绝不能让模型画；
但也不能"交给用户后期"就完事——agent 必须自己叠完再交付。

用法：
  python scripts/burn_subtitles.py <项目目录>
  python scripts/burn_subtitles.py <项目目录> --font /path/to/NotoSansCJK-Regular.ttc
  python scripts/burn_subtitles.py <项目目录> --font-size-ratio 0.062 --y 0.80

输入：<项目目录>/prompts.json 里的 scenes[].subtitle_zh
      以及 <项目目录>/out/ 下的图片（文件名以帧号开头，如 08_xxx.png）
输出：<项目目录>/out/subtitled/<原文件名>  （不覆盖原图）

版式（按你的要求）：
  · 字号更大：默认 = 画面宽 * 0.062（1080 宽 ≈ 67px；可用 --font-size-ratio 调）
  · 边框只包住文字：圆角矩形，按文字块实测尺寸贴合，绝不做整幅长条
  · 半透明黑底 + 白色 92% 字，2–3 行自动换行
"""
import argparse
import json
import os
import sys
import glob

# 控制台编码兜底（Windows GBK 下打印中文/符号会崩）
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("[ERROR] 缺少 Pillow。请先 pip install pillow 再运行本脚本。")

FONT_CANDIDATES = [
    # 项目自带优先（网感标题字，用户可自行放入 fonts/）
    "./fonts/SmileySans-Oblique.ttf",      # 得意黑（最网感，需自行下载）
    "./fonts/AlibabaPuHuiTi-3-85-Bold.otf",# 阿里巴巴普惠体 Bold
    "./fonts/HarmonyOS_Sans_SC_Bold.ttf",
    "./fonts/SourceHanSansSC-Heavy.otf",
    "./fonts/DouyinSansBold.otf",          # 抖音美好体
    # Noto Sans SC 可变字重（可出 Bold/Black，强烈推荐）
    r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    # 系统兜底
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]

BREAKERS = "。！？；：，、,.!?;:，。"
# 不能出现在行首的标点（禁则）
NO_LINE_START = "，。！？；：、）】》」』…—,.!?;:)]}"


def _kinsoku(lines):
    """修正：行首标点移到上一行末；避免出现孤立的标点行。"""
    out = []
    for ln in lines:
        if not ln:
            continue
        if out and ln[0] in NO_LINE_START:
            # 把这些行首标点挪到上一行
            k = 0
            while k < len(ln) and ln[k] in NO_LINE_START:
                k += 1
            out[-1] = out[-1] + ln[:k]
            ln = ln[k:]
            if not ln:
                continue
        out.append(ln)
    return out


def find_font(explicit=None):
    if explicit:
        if os.path.exists(explicit):
            return explicit
        sys.exit(f"[ERROR] 指定的字体不存在：{explicit}")
    env = os.environ.get("SUBTITLE_FONT")
    if env and os.path.exists(env):
        return env
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    # 兜底：在当前系统里搜一下常见中文字体
    for pattern in ("/usr/share/fonts/**/*CJK*", "/usr/share/fonts/**/*wqy*",
                    os.path.expanduser("~/Library/Fonts/*.ttc")):
        hits = glob.glob(pattern, recursive=True)
        if hits:
            return hits[0]
    sys.exit(
        "[ERROR] 找不到中文字体。请任选其一：\n"
        "  1) 把字体放到 <项目>/fonts/ 下（推荐 NotoSansCJK-Regular.ttc）\n"
        "  2) 用 --font /path/to/font.ttc 指定\n"
        "  3) 设置环境变量 SUBTITLE_FONT\n"
        "  ⚠️ 没有中文字体会画出方块/乱码，所以本脚本宁可报错也不静默跳过。"
    )


def _wrap_at(text, font, max_w, draw):
    """在给定最大宽度下按字符换行，优先在标点后断。"""
    cur, lines = "", []
    for ch in text:
        test = cur + ch
        w = draw.textbbox((0, 0), test, font=font)[2]
        if w <= max_w:
            cur = test
        else:
            # 只在靠近行尾（后 25%）的回退区里找标点，避免为了逗号而过早断行
            cut = -1
            lo = max(0, int(len(cur) * 0.75))
            for i in range(len(cur) - 1, lo - 1, -1):
                if cur[i] in BREAKERS:
                    cut = i + 1
                    break
            if cut > 0 and cut < len(cur):
                lines.append(cur[:cut]); cur = cur[cut:] + ch
            else:
                lines.append(cur); cur = ch
    if cur:
        lines.append(cur)
    return [l for l in lines if l]


def wrap_text(text, font, max_w, draw):
    """均衡换行：让各行宽度接近，使底框贴合文字、不再出现'长条'。"""
    text = "".join(seg.strip() for seg in text.split("\n") if seg.strip())
    if not text:
        return []
    full_w = draw.textbbox((0, 0), text, font=font)[2]
    # 目标行数：不超过 3 行
    if full_w <= max_w * 0.92:
        return [text]
    for k in (2, 3):
        target = full_w / k * 1.10          # 每行目标宽度（留一点余量）
        target = min(target, max_w)
        lines = _wrap_at(text, font, target, draw)
        if len(lines) <= k:
            return _kinsoku(lines)
    return _kinsoku(_wrap_at(text, font, max_w, draw))


def draw_subtitle(img, text, font, alpha, y_ratio, max_w_ratio=0.86, bold_stroke=0):
    img = img.convert("RGBA")
    W, H = img.size
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    max_w = int(W * max_w_ratio)
    lines = wrap_text(text, font, max_w, draw)
    if not lines:
        return img

    line_h = int(font.size * 1.55)
    widths = [draw.textbbox((0, 0), l, font=font)[2] for l in lines]
    block_w = max(widths) if widths else 0
    block_h = line_h * len(lines)

    pad_x, pad_y = int(font.size * 0.55), int(font.size * 0.42)
    box_w = block_w + pad_x * 2
    box_h = block_h + pad_y * 2

    # 水平居中；y 用比例定（默认 0.80，避开底部）
    x0 = (W - box_w) // 2
    top = int(H * y_ratio) - box_h // 2
    top = max(int(H * 0.10), min(top, H - box_h - int(H * 0.06)))
    y0 = top

    radius = int(font.size * 0.30)
    draw.rounded_rectangle(
        [x0, y0, x0 + box_w, y0 + box_h],
        radius=radius,
        fill=(0, 0, 0, alpha),
    )

    ty = y0 + pad_y
    for i, line in enumerate(lines):
        lw = widths[i]
        tx = x0 + (box_w - lw) // 2
        # 白色 92% 不透明
        draw.text((tx, ty + i * line_h), line, font=font, fill=(255, 255, 255, 235),
                  stroke_width=bold_stroke, stroke_fill=(255, 255, 255, 235))

    out = Image.alpha_composite(img, overlay).convert("RGB")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", help="项目目录")
    ap.add_argument("--font", default=None)
    ap.add_argument("--font-weight", default="Black",
                    help="可变字重字体用：Thin/Light/Regular/Medium/Bold/Black（默认 Black，最网感）")
    ap.add_argument("--bold-stroke", type=int, default=0,
                    help="非可变字体时用描边加粗，单位像素（0=不加）")
    ap.add_argument("--font-size-ratio", type=float, default=0.062,
                    help="字号 = 画面宽 * 该比例（默认 0.062，比原 1/28 更大）")
    ap.add_argument("--alpha", type=int, default=120, help="底框不透明度 0-255")
    ap.add_argument("--y", type=float, default=0.80, help="字幕中心距顶部的比例")
    ap.add_argument("--src-subdir", default="out")
    ap.add_argument("--out-subdir", default="out/subtitled")
    args = ap.parse_args()

    proj = os.path.abspath(args.dir)
    pj = os.path.join(proj, "prompts.json")
    if not os.path.exists(pj):
        sys.exit(f"[ERROR] 找不到 {pj}，先跑 gen_pack.mjs")
    data = json.load(open(pj, encoding="utf-8"))
    subs = {str(s.get("id")).zfill(2): (s.get("subtitle_zh") or "").strip()
            for s in data.get("scenes", [])}

    src = os.path.join(proj, args.src_subdir)
    if not os.path.isdir(src):
        sys.exit(f"[ERROR] 找不到图片目录 {src}。先把图生成到 out/ 再叠字幕。")

    font_path = find_font(args.font)
    out_dir = os.path.join(proj, args.out_subdir)
    os.makedirs(out_dir, exist_ok=True)

    exts = ("*.png", "*.jpg", "*.jpeg", "*.webp")
    files = []
    for e in exts:
        files += glob.glob(os.path.join(src, e))
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        sys.exit(f"[ERROR] {src} 里没有图片。先生成图。")

    done, skipped, no_sub = 0, 0, []
    for f in sorted(files):
        name = os.path.basename(f)
        fid = name[:2]
        text = subs.get(fid)
        if not text:
            no_sub.append(name)
            continue
        img = Image.open(f)
        W = img.size[0]
        fs = max(18, int(W * args.font_size_ratio))
        font = ImageFont.truetype(font_path, fs)
        try:
            if args.font_weight:
                font.set_variation_by_name(args.font_weight)
        except Exception:
            pass
        try:
            out = draw_subtitle(img, text, font, args.alpha, args.y,
                                bold_stroke=args.bold_stroke)
        except Exception as e:
            print(f"  ! {name} 叠字失败：{e}")
            skipped += 1
            continue
        dst = os.path.join(out_dir, name)
        out.save(dst, quality=95)
        done += 1
        print(f"  ✓ {name}  ← {text[:26]}{'…' if len(text) > 26 else ''}")

    print(f"\n字体：{font_path}")
    print(f"字重：{args.font_weight}") 
    print(f"字号：画面宽 × {args.font_size_ratio}（1080 宽 ≈ {int(1080*args.font_size_ratio)}px）")
    print(f"叠字完成：{done} 张 → {out_dir}")
    if no_sub:
        print(f"⚠ 无字幕文案、已跳过：{len(no_sub)} 张（检查 prompts.json 的 subtitle_zh）")
    if skipped:
        print(f"⚠ 失败：{skipped} 张")
    if done == 0:
        sys.exit("[ERROR] 一张都没成功，检查字体与文件命名（帧号需为文件名前两位）")


if __name__ == "__main__":
    main()
