#!/usr/bin/env node
/**
 * run_pipeline.mjs — 一键把「选题」跑到「可执行出图」
 *
 * 两种用法：
 *   A. 只给选题关键词，让它生成脚手架（选题卡/故事线/分镜骨架），你或 agent 再补细节：
 *        node scripts/run_pipeline.mjs new "<选题>" <项目目录>
 *   B. 已有 scenes.json，直接出整套提示词 + 出图命令：
 *        node scripts/run_pipeline.mjs build <项目目录>
 *
 * 说明：本脚本不调用任何生图 API。它只负责"把骨架落成文件、把提示词拼好、把命令备好"。
 * 真正出图由 agent 的 image_generate 工具或用户自己的工具执行（见 render_commands.txt）。
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const [mode, arg1, arg2] = process.argv.slice(2);

function slugify(s) {
  const ascii = s.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");
  return ascii || "untitled";
}

if (mode === "new") {
  if (!arg1) { console.error('用法: node scripts/run_pipeline.mjs new "<选题>" [项目目录]'); process.exit(1); }
  const topic = arg1;
  const proj = resolve(arg2 || join(process.cwd(), "explore-uncanny", slugify(topic)));
  mkdirSync(proj, { recursive: true });
  mkdirSync(join(proj, "out"), { recursive: true });

  writeFileSync(join(proj, "01_选题卡.md"), `# 选题卡 · ${topic}

- **用户原话**：「${topic}」
- **场域类型**：（地下/水下/垂直/人造废墟/自然异境/时间重复）← 待定
- **下沉方向**：（往下/往深处/往上/往内/往时间里）← 待定
- **怪诞源**：（神像/生物/人造物/时间重复/人体自我）← 待定
- **结尾场景**：医院病房（默认，可换）
- **一句核心恐怖**：← 待填
- **结尾增量（具体到能画）**：← 待填
- **目标帧数**：15–21
`, "utf8");

  writeFileSync(join(proj, "02_故事线.md"), `# 故事线 · ${topic}

## 一句话
> ← 待填：用纪实外壳装一个不断下沉的异常空间，最后用病房把恐怖收回日常。

## 七拍骨架
| 拍 | 帧 | 这一拍发生什么 | 视觉钩子 |
|---|---|---|---|
| Ⅰ 现实锚点 | 1–3 | | |
| Ⅱ 门槛 | 4–5 | | |
| Ⅲ 第一层下沉（不可逆点：?） | 6–10 | | |
| Ⅳ 第二层下沉 | 11–16 | | |
| Ⅴ 最深处（揭示） | 17–21 | | |
| Ⅵ 逃出 | 22–23 | | |
| Ⅶ 反噬 | 24–25 | | |

## 结尾增量
- 媒介：← 照片/视频/录音/报告
- 增量：← 具体
- 与主角关联：← 强关联点

## 五问自检
- [ ] 核心恐怖一句话？ - [ ] 增量能画？ - [ ] 不可逆点帧号？
- [ ] 层级升级在哪？ - [ ] 结尾换场景？
`, "utf8");

  // 空的 scenes.json 骨架（agent 填）
  writeFileSync(join(proj, "scenes.json"), JSON.stringify({
    meta: { title: topic, slug: slugify(topic), frame_count: 0, style_key: "STYLE", hero_frame: null },
    scenes: []
  }, null, 2), "utf8");

  writeFileSync(join(proj, "03_分镜表.md"), `# 分镜表 · ${topic}\n\n| 帧 | 拍 | 画面一句话 | R | 机位 | 人物% | 光 | STYLE | 字幕 |\n|---|---|---|---|---|---|---|---|---|\n\n> 填完同步到 scenes.json。\n`, "utf8");

  console.log(`✓ 脚手架已建：${proj}`);
  console.log(`下一步：填 02_故事线.md / 03_分镜表.md / scenes.json，然后跑：`);
  console.log(`  node scripts/run_pipeline.mjs build "${proj}"`);
  process.exit(0);
}

if (mode === "build") {
  const proj = resolve(arg1 || ".");
  if (!existsSync(join(proj, "scenes.json"))) { console.error(`找不到 ${proj}/scenes.json`); process.exit(1); }
  const d = JSON.parse(readFileSync(join(proj, "scenes.json"), "utf8"));
  if (!d.scenes?.length) { console.error("scenes.json 里 scenes 为空，先填分镜"); process.exit(1); }
  try {
    const out = execFileSync(process.execPath, [join(HERE, "gen_pack.mjs"), proj], { encoding: "utf8" });
    process.stdout.write(out);
  } catch (e) {
    process.stdout.write(e.stdout || "");
    process.stderr.write(e.stderr || "");
    console.error("\n✗ gen_pack 报告了结构问题，先修 scenes.json 再重跑");
    process.exit(2);
  }
  console.log(`\n下一步：`);
  console.log(`  · 有 image_generate 工具 → 按 render_commands.txt 逐条生成（定价帧 count=4）`);
  console.log(`  · 没有 → 把 render_commands.txt 交给你的生图工具`);
  console.log(`  · 验收：node scripts/validate.mjs "${proj}"`);
  process.exit(0);
}

console.error("用法：\n  node scripts/run_pipeline.mjs new \"<选题>\" [目录]\n  node scripts/run_pipeline.mjs build <目录>");
process.exit(1);
