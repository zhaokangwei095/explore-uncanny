#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_title.py — 标题风格校验（两种流派：A 定名式 / B 钩子式）

用法：
  python scripts/check_title.py "深山禁寺"
  python scripts/check_title.py "父亲失踪三年后，我在雪山里收到了他的信号"
  python scripts/check_title.py "震惊！深山里竟有这种事"   # 会报标题党
"""
import argparse
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CLICKBAIT = ["震惊", "细思极恐", "吓哭", "千万别", "胆小慎入", "不转不是",
             "全网", "绝了", "逆天", "炸裂", "破防", "谁懂", "救命"]
TOO_VAGUE = ["神秘的", "诡异的", "恐怖", "可怕", "惊悚"]  # 纯堆形容词


def check(title):
    errs, warns = [], []
    n = len(title)

    # 1) 标点
    if "！" in title or "!" in title:
        errs.append("用感叹号——破坏纪实冷静调性")
    if "？" in title or "?" in title:
        errs.append("用问号——这类标题不用问句")
    for w in CLICKBAIT:
        if w in title:
            errs.append(f"标题党词「{w}」——数据最好的样本都极克制")

    # 2) 流派判定
    if n <= 8:
        style = "A 定名式"
        if n < 3:
            errs.append("太短（<3字）")
        # A 流派要有"不对劲"的字
        weird = any(c in title for c in "禁哑骨尸死枯黑断阴幽空寒眠沉噬血鬼喘咬烂霉锈")
        if not weird:
            warns.append("A 流派建议含一个'不对劲'的字（禁/哑/骨/断/阴…），否则太平")
        if any(w in title for w in TOO_VAGUE):
            errs.append("堆形容词——A 流派要具体名词，不要'神秘的XX'")
    elif n <= 24:
        style = "B 钩子式"
        # 四段式：至少含时间/地点/反常之一
        has_time = any(k in title for k in ["年", "天", "个月", "之后", "后来", "自从"])
        has_place = any(k in title for k in ["在", "里", "山", "厂", "村", "洞", "站", "隧道", "屋"])
        has_odd = any(k in title for k in ["信号", "名字", "收到", "多", "少", "醒", "亮", "响", "回来", "出现", "收到了"])
        seg = sum([has_time, has_place, has_odd])
        if seg < 2:
            warns.append("B 流派信息不足：建议凑齐『时间/地点/反常事实』至少两项")
        if n > 15 and "，" not in title and "," not in title:
            warns.append("超过15字建议用逗号断一次")
    else:
        style = "过长（>24字）"
        errs.append(f"{n} 字——超过 24 字，读者扫不完")

    return style, n, errs, warns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("titles", nargs="+")
    args = ap.parse_args()

    for t in args.titles:
        style, n, errs, warns = check(t)
        print(f"\n标题：《{t}》")
        print(f"  流派判定：{style}（{n} 字）")
        if not errs and not warns:
            print("  ✓ 通过")
        for e in errs:
            print(f"  ✗ {e}")
        for w in warns:
            print(f"  ⚠ {w}")
    total_err = sum(len(check(t)[2]) for t in args.titles)
    print(f"\n合计 error {total_err} 条")
    sys.exit(1 if total_err else 0)


if __name__ == "__main__":
    main()
