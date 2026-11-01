#!/usr/bin/env node
/**
 * validate.mjs — 验收一个 explore-uncanny 项目产物是否完整、是否踩坑
 *
 * 用法：node scripts/validate.mjs <项目目录>
 * 退出码：0 全过；1 有 error；2 只有 warning
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("用法: node scripts/validate.mjs <项目目录>"); process.exit(1); }
const proj = resolve(dir);

const errs = [], warns = [];
const need = ["01_选题卡.md","02_故事线.md","03_分镜表.md","scenes.json","04_提示词全套.md","prompts.json","render_commands.txt","README.md"];
for (const f of need) if (!existsSync(join(proj, f))) errs.push(`缺文件：${f}`);

let data = null;
if (existsSync(join(proj, "scenes.json"))) {
  try { data = JSON.parse(readFileSync(join(proj, "scenes.json"), "utf8")); }
  catch (e) { errs.push(`scenes.json 不是合法 JSON：${e.message}`); }
}

if (data) {
  const n = data.scenes?.length || 0;
  if (n < 12) warns.push(`帧数 ${n} < 12，故事可能不完整`);
  if (n > 25) warns.push(`帧数 ${n} > 25，节奏可能拖`);

  // 1) 结尾必须换场景（最后 2 帧应含 ward/室内类 style 或 compo=ward）
  const last = data.scenes.slice(-2);
  const endIndoor = last.some(s => s.style_variant === "STYLE_WARD" || s.compo_variant === "ward");
  // 子类型 B 的公式1：结尾可回到开场画面做闭环（户外），此时允许不换室内
  const isLoopEnding = last.some(s => /反转|闭环|回到开场|loop|same framing|same light/i.test((s.beat||"") + (s.scene_en||"") + (s.title||"")));
  if (!endIndoor && !isLoopEnding) errs.push("最后 2 帧既不是室内反噬、也不是闭环结尾（定价帧缺失）");

  // 2) 人物递减（只检查"下沉段"内；逃出/反噬帧人物变大是合理的）
  const descent = data.scenes.filter(s => {
    const b = s.beat || "";
    return !/逃出|反噬|封面|Ⅵ|Ⅶ/.test(b) && String(s.id) !== "00" && typeof s.fig_scale === "number" && s.fig_scale > 0;
  });
  for (let i = 1; i < descent.length; i++) {
    if (descent[i].fig_scale > descent[i-1].fig_scale + 5)
      warns.push(`下沉段人物占比在帧 ${descent[i].id} 回升（${descent[i-1].fig_scale}→${descent[i].fig_scale}），检查是否破坏了"被吞"感`);
  }

  // 3) 必须有一帧俯视深井（compo_variant=down）且内容合理
  if (!data.scenes.some(s => s.compo_variant === "down")) warns.push("没有 COMPO_DOWN 帧，缺少'下面还有'的下坠感");

  // 4) 每帧尺寸句（例外：看清脸帧 / ward 持机帧）
  for (const s of data.scenes) {
    const fig = s.fig_anchor_en || "";
    const isFaceFrame = /face reads clearly|walks toward the camera/i.test(fig);
    const isNoFigure = /no figure|still life|no one in|nobody in/i.test(fig) || /still life of objects/i.test(s.scene_en || "");
    const isHolderFrame = s.compo_variant === "ward" || s.lens === "screen";
    const hasSize = /no taller than|no bigger than|no larger than|smaller than|a small dark|a tiny|a very small|as tall as/i.test(fig);
    if (!hasSize && !isFaceFrame && !isHolderFrame && !isNoFigure) errs.push(`帧 ${s.id}：fig_anchor_en 缺尺寸比喻或"看清脸"句式`);
    if (/percent of the frame height/i.test(fig)) errs.push(`帧 ${s.id}：fig_anchor_en 含百分比（无效）`);
    if (/mid-step/i.test(fig) && !isFaceFrame) warns.push(`帧 ${s.id}：含 mid-step（会放大人物）`);
    if (!s.scene_en?.startsWith("Scene:")) errs.push(`帧 ${s.id}：scene_en 应以 "Scene:" 开头`);
    if (!s.light || !/^L[1-8]$/.test(s.light)) errs.push(`帧 ${s.id}：light 应为 L1–L8`);
    if (!s.camera || !/^C[1-5]$/.test(s.camera)) errs.push(`帧 ${s.id}：camera 应为 C1–C5`);
    // 3–5 条 R 规则里取 2–3
    if (s.rules?.length === 1) warns.push(`帧 ${s.id}：只用了 1 条 R 规则，可能不够怪`);
    if (s.rules?.length > 3) warns.push(`帧 ${s.id}：R 规则超过 3 条，会糊`);
  }

  // 5) 空间升级：每 5–6 帧一次（用 beat 变化粗判）
  const beats = data.scenes.map(s => s.beat || "");
  const distinctBeats = new Set(beats).size;
  if (distinctBeats < 5) warns.push(`只有 ${distinctBeats} 个不同拍，检查是否空间升级不足`);

  // 6) 英雄帧
  const hero = data.meta?.hero_frame;
  if (hero == null) warns.push("未设 hero_frame（定价帧），建议指定一帧做定调");
  else if (!data.scenes.some(s => String(s.id) === String(hero))) errs.push(`hero_frame=${hero} 不存在`);
}

// 6.5) 字幕是否已烧到图上（必须有 out/subtitled，且数量≈出图数）
{
  const outDir = join(proj, "out");
  const subDir = join(proj, "out", "subtitled");
  const exts = [".png", ".jpg", ".jpeg", ".webp"];
  const imgs = existsSync(outDir) ? readdirSync(outDir).filter(f => exts.some(e => f.toLowerCase().endsWith(e))) : [];
  const subs = existsSync(subDir) ? readdirSync(subDir).filter(f => exts.some(e => f.toLowerCase().endsWith(e))) : [];
  if (imgs.length > 0 && subs.length === 0) {
    errs.push("已出图但没有叠字幕：缺 out/subtitled/。必须跑 scripts/burn_subtitles.py 再交付");
  } else if (imgs.length > 0 && subs.length < imgs.length) {
    warns.push(`字幕只叠了 ${subs.length}/${imgs.length} 张，检查是否有帧缺 subtitle_zh`);
  }
}

// 6.6) 封面：默认强制（除非 meta.skip_cover === true）
if (data) {
  const meta = data.meta || {};
  const skip = meta.skip_cover === true;
  const subDir = join(proj, "out", "subtitled");
  const hasCoverImg = existsSync(subDir) && readdirSync(subDir).some(f => /^00.*\.(png|jpg|jpeg|webp)$/i.test(f));
  const hasCoverFrame = (data.scenes || []).some(sc => String(sc.id) === "00");
  const coverIsFirstFrame = meta.cover_mode === "first_frame"; // 首帧兼任封面（用于"就出 N 张"的场景）
  if (!skip) {
    if (!hasCoverFrame && !coverIsFirstFrame) {
      errs.push("缺封面帧：scenes.json 里必须有 id=\"00\" 且 compo_variant=\"cover\" 的一帧（或设 meta.cover_mode=\"first_frame\" 让首帧兼任封面）");
    }
    if (!hasCoverImg) errs.push("缺封面图：out/subtitled/00_封面.png 不存在。必须跑 scripts/make_cover.py（不生成封面不算交付）");
  }
  if (skip && !meta.skip_cover_reason) warns.push("skip_cover=true 但没写 skip_cover_reason（说明为什么不要封面）");
}

// 6.7) 新闻改编必须去标识化
if (data && data.meta && data.meta.topic_source) {
  const ts = data.meta.topic_source;
  if (ts.type === "news") {
    if (!Array.isArray(ts.anonymized) || ts.anonymized.length === 0) {
      errs.push("topic_source.type=news 但没填 anonymized（必须列出已虚化的信息类别，如 地名/机构/人名/时间）");
    }
    if (!ts.fictional_layer || String(ts.fictional_layer).trim().length < 4) {
      errs.push("topic_source.type=news 但没填 fictional_layer（必须写清加的那层'不可能对应现实'的设定）");
    }
    if (!ts.based_on) {
      warns.push("topic_source 缺 based_on（建议写'公开报道中的同类事件（已合并、已抽象）'）");
    }
  }
}

// 6.8) 敏感措辞扫描（任何项目都扫，不限是否标注 news）
{
  const risky = ["根据真实事件改编", "本片根据真实", "警方通报", "据当地村民称", "本报记者"];
  for (const f of ["04_提示词全套.md", "03_分镜表.md", "02_故事线.md"]) {
    const fp = join(proj, f);
    if (!existsSync(fp)) continue;
    const lines = readFileSync(fp, "utf8").split("\n");
    for (const ln of lines) {
      // 免责声明（含"虚构/无关/纯属"）不算风险
      if (/虚构|无关|纯属|disclaimer/i.test(ln)) continue;
      for (const r of risky) {
        if (ln.includes(r)) warns.push(`${f} 出现可能指认真实事件的措辞「${r}」，建议删除`);
      }
    }
  }
}

// 7) 生成物里的禁用词
for (const f of ["04_提示词全套.md","prompts.json"]) {
  const p = join(proj, f);
  if (!existsSync(p)) continue;
  const t = readFileSync(p, "utf8").toLowerCase();
  for (const w of ["found footage","found-footage","hiking vlog","smartphone main camera"]) {
    if (t.includes(w)) errs.push(`${f} 含禁用词「${w}」（会画 REC 时间码）`);
  }
  if (t.includes("3d render") && f === "prompts.json") warns.push(`${f} 负向里出现 3d render（可能反噬，建议移除）`);
}

// 8) 字幕是否误写成"让模型画"
if (data) for (const s of data.scenes) {
  if (s.scene_en && /[\u4e00-\u9fa5]/.test(s.scene_en)) warns.push(`帧 ${s.id}：scene_en 里有中文（英文提示词不该含中文）`);
}

console.log(`\n=== 验收：${proj} ===`);
if (!errs.length && !warns.length) { console.log("✓ 全部通过"); process.exit(0); }
if (errs.length) { console.log(`\n✗ error ${errs.length} 条（必须修）：`); errs.forEach(e => console.log("  - " + e)); }
if (warns.length) { console.log(`\n⚠ warning ${warns.length} 条（建议修）：`); warns.forEach(w => console.log("  - " + w)); }
process.exit(errs.length ? 1 : 2);
