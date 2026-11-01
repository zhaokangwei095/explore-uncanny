#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
place_names.py — 仿古虚构地名生成器 + 真实性校验

两个用途：
  1) 生成：按古地名构词法拼出"像古地名但查不到"的名字
  2) 校验：检查给定地名是否踩了"真实地名黑名单"

用法：
  python scripts/place_names.py gen            # 随机生成 12 个候选
  python scripts/place_names.py gen --n 20 --seed 7
  python scripts/place_names.py check 断颈梁 哑口 巫峡 秦岭
"""
import argparse
import random
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---- 部件库（与 references/14 一致）----
TERRAIN = ["岭", "梁", "坳", "峪", "峡", "塞", "关", "隘", "坡", "渡", "津",
           "汊", "窝", "陀", "塬", "谷", "崖", "坪", "坎", "垭"]
WATER = ["溪", "潭", "涧", "泉", "沱", "汀", "浦", "濑", "湾", "汊"]
BUILD = ["驿", "铺", "寨", "堡", "屯", "台", "观", "祠", "庵", "关厢", "哨"]
# 修饰词：只保留能自然搭配地形的（剔除"无关/空坎"这类不成词的）
MODIFIER = ["黑", "哑", "断", "枯", "幽", "阴", "骨", "铁", "灰", "死", "寒", "眠", "沉", "蚀"]

# 精选"修饰+地形"成词组合（配方 A 专用，保证像地名）
A_PAIRS = [
    "黑石坳", "断颈梁", "黑风口", "哑河沟", "枯井坪", "幽峡", "阴坡",
    "骨坡", "铁门关", "灰崖", "死人坡", "寒水渡", "眠龙岭", "沉钟壑",
    "黑松坳", "断魂崖", "哑岭", "枯泉涧", "铁锁关", "白骨坡", "寒鸦岭",
    "阴司垭", "黑水陀", "断山口", "哑巴沟", "枯草坪", "眠牛岭", "沉船渡",
    "黑崖口", "断崖坪", "铁坪", "灰峪", "死水塘", "寒坡垭",
]
OBJ = ["落雁", "断颈", "倒影", "无灯", "回声", "白骨", "沉钟", "哑角",
       "断喉", "空棺", "无渡", "长眠", "锁龙", "蚀骨"]
NUM = ["十八", "九", "三", "十二", "七十二"]
NUM_TERRAIN = ["盘", "湾", "拐", "折", "曲涧", "道拐"]
MIL = ["哨鹿", "戍边", "兵马", "烽火", "屯兵", "巡道", "守隘"]

# ---- 真实地名黑名单（出现即判不合格）----
BLACKLIST = [
    # 大山大水
    "秦岭", "太行", "哀牢", "昆仑", "巫山", "武陵", "昆仑山", "天山", "祁连",
    "横断", "南岭", "武夷", "雪峰", "大巴", "岷山", "邛崃", "六盘", "吕梁",
    "黄河", "长江", "珠江", "澜沧", "怒江", "雅鲁藏布", "金沙江", "汉水",
    # 著名景区
    "九寨", "张家界", "神农架", "武陵源", "黄龙", "稻城", "香格里", "泸沽",
    "喀纳斯", "额济纳", "腾格里", "鸣沙", "月牙泉", "虎跳", "梅里", "贡嘎",
    # 名关名隘
    "剑门", "娘子关", "嘉峪关", "函谷", "雁门", "居庸", "山海关", "潼关",
    "玉门", "阳关", "紫荆关", "倒马关", "平型关", "偏头关", "铁门关", "铁门", "黑风口", "烽火台",
    # 常见行政区/城市（防"某地"被填成真名）
    "北京", "上海", "广州", "深圳", "成都", "重庆", "西安", "南京", "杭州",
    "武汉", "长沙", "郑州", "济南", "昆明", "贵阳", "兰州", "西宁", "拉萨",
]

# ---- 真实古地名样本（易查，用于提示"这类别直接用"）----
CLASSIC_REAL = ["巫峡", "夜郎", "烛龙塞", "楼兰", "高昌", "交河", "阳关", "玉门"]


def generate(n=12, seed=None):
    rng = random.Random(seed)
    out = []
    seen = set()
    tried = 0
    while len(out) < n and tried < n * 40:
        tried += 1
        kind = rng.choice(["A", "A", "B", "C", "D"])  # A 权重高
        if kind == "A":
            name = rng.choice(A_PAIRS)   # 精选成词组合
        elif kind == "B":
            name = rng.choice(OBJ) + rng.choice(TERRAIN + WATER)
        elif kind == "C":
            name = rng.choice(NUM) + rng.choice(NUM_TERRAIN)
        else:
            name = rng.choice(MIL) + rng.choice(TERRAIN + BUILD)
        if len(name) < 2 or len(name) > 5:
            continue
        if name in seen:
            continue
        if not check_one(name)[0]:
            continue
        seen.add(name)
        out.append((name, kind))
    return out


def check_one(name):
    """返回 (是否合格, 原因)"""
    for bad in BLACKLIST:
        if bad in name:
            return False, f"含真实地名「{bad}」"
    if name in CLASSIC_REAL:
        return False, "这是可考的真实古地名，别直接用"
    # 太短或纯常见词
    if len(name) < 2:
        return False, "太短"
    return True, "ok（仿古虚构，需再自行搜索确认查无此地）"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "check"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.cmd == "gen":
        items = generate(args.n, args.seed)
        print("候选仿古地名（用前请再搜一遍确认查无此地）：\n")
        for name, kind in items:
            print(f"  {name:<6}  （配方 {kind}）")
        print(f"\n共 {len(items)} 个。")
    else:
        if not args.names:
            args.names = ["断颈梁", "哑口", "巫峡", "秦岭"]
        print("地名校验：\n")
        ok = 0
        fail = 0
        for nm in args.names:
            passed, why = check_one(nm)
            mark = "✓" if passed else "✗"
            print(f"  {mark} {nm:<8} {why}")
            ok += passed
            fail += (not passed)
        print(f"\n通过 {ok} / 不合格 {fail}")
        if fail:
            print("⚠ 不合格的请换名（生成：python scripts/place_names.py gen）")


if __name__ == "__main__":
    main()
