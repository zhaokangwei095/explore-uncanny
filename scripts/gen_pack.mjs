#!/usr/bin/env node
/**
 * gen_pack.mjs — 把 scenes.json 展开成整套提示词 + 批量命令
 *
 * 用法：
 *   node scripts/gen_pack.mjs <项目目录>
 *   node scripts/gen_pack.mjs ./explore-uncanny/deepsea-rig
 *
 * 输入：<项目目录>/scenes.json（结构见 references/07_输出目录规范.md）
 * 输出：<项目目录>/04_提示词全套.md
 *       <项目目录>/prompts.json
 *       <项目目录>/render_commands.txt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("用法: node scripts/gen_pack.mjs <项目目录>"); process.exit(1); }
const proj = resolve(dir);
const data = JSON.parse(readFileSync(join(proj, "scenes.json"), "utf8"));

/* ---------- 固定块（与 references/04_提示词拼装.md 逐字一致） ---------- */
const STYLE = {
  STYLE:
    "A real, unposed documentary photograph, one frame pulled from a walk in the rain. Vertical 9:16, handheld, the horizon off by two or three degrees. 24mm equivalent wide lens, mild barrel distortion, corners slightly soft. Fine sensor grain across the whole image, low dynamic range, matte low-contrast grade. The colour has been drained out of it: it reads almost black and white, with only a faint cold grey-green left in the wet stone. Average brightness around 30 percent, roughly 40 percent of the frame in shadow. It looks like a photograph taken by a tired man in the rain, not by a professional.",
  STYLE_DAY:
    "A real, unposed documentary photograph, one frame pulled from a walk in the rain. Vertical 9:16, handheld, the horizon off by two or three degrees. 24mm equivalent wide lens, mild barrel distortion, corners slightly soft. Fine sensor grain, low dynamic range, matte low-contrast grade. Bright wet overcast daylight, so the grade sits higher than the underground frames: the colour stays muted rather than absent, olive-green and wet limestone, desaturated and not vivid, with a cool green-teal in the blacks; average brightness around 42 percent, roughly 25 percent of the frame in shadow. It looks like a photograph taken by a tired man in the rain, not by a professional.",
  STYLE_WARD:
    "A real, unposed documentary photograph, one frame taken in a hospital room at night. Vertical 9:16, handheld, 26mm equivalent lens, mild barrel distortion. Fine sensor grain, low dynamic range, matte low-contrast grade. This is a lit interior at night, not a cave: cool white-blue fluorescent light on the walls and the cotton, only about 20 percent of the frame in shadow, and the shadows carry a clean blue-grey rather than a murky teal. Warm amber city light comes through the window as the single warm accent. Average brightness around 45 percent. It looks like a photograph taken by a patient in bed, not by a professional.",
  STYLE_SNOW:
    "A real, unposed documentary photograph, one frame pulled from a personal record. Vertical 9:16, handheld, 24mm equivalent wide lens, mild barrel distortion, corners slightly soft. Fine sensor grain, low dynamic range, matte grade. High-key cold blue-white overcast on snow: most of the frame is bright, the snow reads pale blue-grey rather than pure white, the sky is a flat white sheet, and the only warm accent is a single orange pack. Colours are muted, never vivid; the blacks stay cool blue-grey. Average brightness around 46 percent. It looks like a photo taken by a tired person on a mountain, not by a professional.",
  STYLE_SHIP:
    "A real, unposed documentary photograph, one frame pulled from a personal record. Vertical 9:16, handheld, 24mm equivalent wide lens, mild barrel distortion. Fine sensor grain, low dynamic range, matte grade. Near-black interior: deep blue-black metal surfaces, only one cold practical light source, about 90 percent of the frame sitting in shadow with barely readable cool detail. A faint cyan glow from a hologram or instrument panel is the only colour. No neon, no lens flares, no coloured gels. It looks like a photo taken by a person with a phone in a dark place, not by a professional.",
};

const CHAR =
  "A single figure for scale: an East Asian man, 25 to 32 years old, short slightly messy black hair, matte dark hooded softshell jacket with the zip half open and the hood down, plain dark crew-neck t-shirt, dark grey cargo trousers, black backpack with worn grey webbing straps, dark grey-green boots. He is seen from behind or three-quarter back, with his back to the camera, standing still, shoulders slightly forward, no gesture, no expression. He is a scale marker, not a subject. ";

const COMPO = {
  default:
    "Composition: the colossal structure fills the upper two thirds of the frame and overflows its edges, cut off by the top border, so only its lower part is visible. The man never rises above the lower quarter of the frame. A specific close foreground occluder — a wet rock edge, a metal strut, a doorframe, or a hanging vine — blocks one corner close to the lens, so he is seen past it. Nothing is centred and nothing is symmetrical.",
  down:
    "Composition: the camera looks steeply down and the depth falls away below the viewer. Everything colossal lies below and beyond, seen in extreme foreshortening from above; nothing colossal stands upright in front of the camera to fill the top of the frame. The man is a small dark mark in the lower part of the frame, well below the middle line. A specific close foreground occluder, a wet rock edge or a metal railing or a carved parapet, cuts one corner close to the lens. Nothing is centred.",
  cover:
    "Composition: a vertical cover frame built around one overwhelming subject. The colossal structure or anomaly occupies the lower two thirds and is cropped hard by the side and bottom edges, and the upper third is a quiet, low-detail dark area of mist, shadow or empty sky where a title can later sit. One small figure for scale stands off centre in the lower third, clearly dwarfed. One strong focal point, strong tonal separation between the dark quiet upper area and the lit subject, nothing centred, nothing symmetrical.",
  ward:
    "Composition: a vertical phone snapshot taken by someone lying in bed. The man's head and hands sit in the lower left corner as a soft out-of-focus mass; past them the room is sharp and steady. The phone screen is held at chest height and faces the lens squarely, and it is the only thing in the frame that is in focus. The whole picture is a little crooked, as if taken one-handed.",
};

const MATERIAL =
  "Surfaces read as permanently wet: moss, lichen, green algae film, dark water streaks running down carved stone, calcium bloom, rusted iron, cobwebs, hanging lianas, and a scattering of wet dead leaves on every horizontal surface. Everything is seeping water, everything is growing fuzz.";

const MATERIAL_VARIANTS = {
  default: MATERIAL,
  snow:
    "Surfaces are wind-packed snow and old ice: a hard crust that takes boot prints sharply, frost feathers on exposed rock, a dull sheen where the wind has polished it, and dark grit blown into the drifts. Frozen, dry, and silent; nothing is wet and nothing is growing.",
  ship:
    "Surfaces are brushed dark metal: cold condensation beading on the panels, faint concentric machining marks, edges worn smooth by handling, and a thin film of dust in the seams. One low-status practical light reflects along them. Nothing is rusted and nothing is organic.",
  industrial:
    "Surfaces are wet concrete, rusted steel and oil: standing water in the joints, rust bleeding in long streaks from bolts, greasy film on the machine beds, dust settled into every ledge, and a scatter of dead leaves blown in from outside. Cold and damp, but it is a workplace, not a cave.",
  ward:
    "Surfaces are clean but used, not damp: creased cotton in the gown, scuffed plastic on the monitor bezel and the drip bag, matt paint on the wall, a thin film of dust on the windowsill, and a cold reflection on the glass of the window. Nothing is wet and nothing is growing.",
};

const LIGHT = {
  L1: "Lighting: flat overcast daylight from a white sheet of sky, no sun disc, everything wet so the stone throws back wide soft highlights, haze between trunks at three depths.",
  L2: "Lighting: a weak grey daylight leaks down from an opening high above and lifts the thin mist; it only makes the air near the ceiling paler than the air at the floor. Outside that patch everything drops to near black but still holds readable teal-grey detail; the blacks are never clipped flat.",
  L3: "Lighting: a small cold pool of flashlight light entering from the viewer's position, reaching only one to two metres of wet rock before it fades; the thin mist above is a little paler than the dark around it, so the space behind the light is not empty black.",
  L4: "Lighting: cold white fluorescent ceiling light from the upper left, wrapping softly on skin and cotton; a warm amber dusk skyline glows through the window at the right, the two colour temperatures meeting across the middle of the frame; the phone screen throws a small cool glow onto the hands and the jaw.",
  L5: "Lighting: low overcast dusk light, grey-blue, with a thin band of muted orange on the horizon behind the ridge; no sun disc, long soft shadows.",
  L6: "Lighting: the only light source is the phone screen, a small cool blue-white rectangle lighting the hand and the edge of the jaw, the rest of the room falling into dusk.",
  L7: "Lighting: flat overcast snow light from a white sheet of sky, no sun and no shadow edge, snow throwing a faint blue bounce up into everything, cold and shadowless.",
  L8: "Lighting: one cold practical light deep inside a dark metal space, hard-edged but dim, leaving most surfaces near black; a faint cyan glow from a panel or hologram, dust hanging in the air.",
};

const LENS = {
  up: "Shot on a 24mm equivalent lens from chest height tilted up five degrees, f/2.4, the near foreground sharp and the structure above softened by haze rather than defocus.",
  down: "Shot on a 24mm equivalent lens looking steeply down, f/2.8; the near foreground is sharp and the bottom of the space dissolves into mist.",
  eye: "Shot on a 35mm equivalent lens at eye level, f/2.8, the figure sharp and the surroundings softened by mist.",
  screen: "Shot on a 26mm equivalent lens at f/1.8; the near head and hands are soft and out of focus, the phone screen and the room behind it are sharp.",
};

const TAIL =
  "The frame itself is a clean photograph: no text, no subtitles, no watermark, no border, no camera UI, no logo, no timestamp and no filename.";

const NEG = {
  negative_tokens_en: [
    "oversaturated","neon","magenta","purple grade","teal-and-orange","golden halo","lotus pedestal",
    "auspicious clouds","torii gate","gothic","egyptian","cartoon","anime","illustration",
    "canonical symmetrical poster composition","text","watermark","timestamp","filename","border","UI",
  ],
  strict_avoid_sentence:
    "Strictly avoid: oversaturation, magenta or purple grade, golden halo, any text, watermark, timestamp or filename, and any border or camera UI.",
};

/* ---------- 拼装 ---------- */
function requireField(sc, k) {
  if (sc[k] == null || sc[k] === "") throw new Error(`帧 ${sc.id} 缺字段 ${k}`);
  return sc[k];
}

const built = [];
const problems = [];
for (const sc of data.scenes) {
  try {
    const style = STYLE[sc.style_variant || "STYLE"];
    if (!style) throw new Error(`未知 style_variant: ${sc.style_variant}`);
    const compo = COMPO[sc.compo_variant || "default"];
    if (!compo) throw new Error(`未知 compo_variant: ${sc.compo_variant}`);
    const light = LIGHT[requireField(sc, "light")];
    if (!light) throw new Error(`未知 light: ${sc.light}`);
    const lens = LENS[sc.lens || "up"];
    if (!lens) throw new Error(`未知 lens: ${sc.lens}`);

    const scene = requireField(sc, "scene_en");
    const fig = requireField(sc, "fig_anchor_en");
    // 尺寸比喻校验：fig_anchor 必须含一个尺寸比喻词。
    // 例外：① "看清脸"的现实锚点帧 ② ward/看回放帧（人物是前景持机者，不是尺度标尺）
    const isFaceFrame = /face reads clearly|walks toward the camera/i.test(fig);
    const isNoFigure = /no figure|still life|no one in|nobody in/i.test(fig) || /still life of objects/i.test(sc.scene_en || "");
    const isHolderFrame = sc.compo_variant === "ward" || sc.lens === "screen";
    const hasSize = /no taller than|no bigger than|no larger than|smaller than|a small dark|a tiny|a very small|as tall as/i.test(fig);
    if (!hasSize && !isFaceFrame && !isHolderFrame && !isNoFigure) {
      problems.push(`帧 ${sc.id}：fig_anchor_en 缺尺寸比喻（会让人物变大）`);
    }
    if (/percent of the frame height/i.test(fig)) {
      problems.push(`帧 ${sc.id}：fig_anchor_en 里出现百分比（实测无效，删掉）`);
    }
    if (/mid-step/i.test(fig)) problems.push(`帧 ${sc.id}：fig_anchor_en 含 mid-step（会放大人物）`);

    let mv = sc.material_variant;
    if (!mv) {
      const txt = ((sc.scene_en || "") + " " + (sc.title || "")).toLowerCase();
      if (/hospital|ward|病房|bed|drip|monitor/.test(txt)) mv = "ward";
      else if (/factory|machine|plant|yard|workshop|factory|厂|车间|工位|考勤|press|lathe|turbine|corridor of the plant/.test(txt)) mv = "industrial";
      else if (/snow|ice|glacier|雪山|冰/.test(txt)) mv = "snow";
      else if (/ship|hull|dome|飞船|舱/.test(txt)) mv = "ship";
      else mv = "default";
    }
    if (sc.material_variant) mv = sc.material_variant; // 显式优先
    const material = MATERIAL_VARIANTS[mv];
    if (!material) throw new Error(`未知 material_variant: ${sc.material_variant}`);
    const prompt = [style, scene, CHAR + fig, compo, light, material, lens, TAIL].join("\n\n");
    built.push({ ...sc, prompt_en: prompt });
  } catch (e) {
    problems.push(`${sc.id}: ${e.message}`);
  }
}

/* ---------- 全局禁用词检查 ---------- */
const BANNED = ["found footage","found-footage","hiking vlog","smartphone main camera","shot on a phone","god ray","volumetric cone","visible cone","bright beam"];
const bannedHits = [];
for (const b of built) for (const w of BANNED) if (b.prompt_en.toLowerCase().includes(w)) bannedHits.push(`帧 ${b.id}: ${w}`);

/* ---------- 输出 ---------- */
const out = { meta: { ...data.meta, generated: new Date().toISOString(), blocks: { STYLE, CHARACTER: CHAR, COMPOSITION: COMPO, MATERIAL: MATERIAL_VARIANTS, LIGHT, LENS, TAIL }, ...NEG }, scenes: built };
writeFileSync(join(proj, "prompts.json"), JSON.stringify(out, null, 2), "utf8");

const md = [];
md.push(`# 04 · 提示词全套 · ${data.meta?.title || ""}\n`);
md.push(`> 由 gen_pack.mjs 从 scenes.json 生成，共 ${built.length} 帧。**不要手改本文件**，改 scenes.json 后重跑。\n`);
md.push(`> 负向：能填 negative 框的用 \`negative_tokens_en\`；不能填的（GPT-Image/Gemini/Seedream）只加 \`strict_avoid_sentence\`。\n`);
for (const s of built) {
  md.push(`\n---\n\n## ${s.id} · ${s.title || ""}${s.beat ? `（${s.beat}）` : ""}\n`);
  md.push(`- 机位 ${s.camera || "-"}｜光 ${s.light}｜STYLE ${s.style_variant || "STYLE"}｜构图 ${s.compo_variant || "default"}｜参考人物占比 ${s.fig_scale ?? "-"}%`);
  if (s.one_liner) md.push(`- 画面：${s.one_liner}`);
  if (s.rules?.length) md.push(`- 怪诞规则：${s.rules.join(" / ")}`);
  if (s.subtitle_zh) md.push(`- 字幕（后期叠）：${s.subtitle_zh}`);
  md.push(`\n\`\`\`\n${s.prompt_en}\n\`\`\``);
}
writeFileSync(join(proj, "04_提示词全套.md"), md.join("\n"), "utf8");

const cmds = [];
const MODEL = process.env.IMAGE_MODEL || "openai/gpt-image-2";
const SIZE = process.env.IMAGE_SIZE || "1152x2048";
for (const s of built) {
  const isOpenAI = MODEL.startsWith("openai/");
  const sizeArg = isOpenAI ? `size=${SIZE}` : `aspectRatio=9:16`;
  cmds.push(`# ${s.id} ${s.title || ""}`);
  cmds.push(`/tool image_generate action=generate model=${MODEL} prompt="${s.prompt_en.replace(/"/g, '\\"')}" ${sizeArg} count=${s.compo_variant === "down" || String(data.meta?.hero_frame) === String(s.id) ? 4 : 1}`);
  cmds.push("");
}
writeFileSync(join(proj, "render_commands.txt"), cmds.join("\n"), "utf8");

/* ---------- 报告 ---------- */
console.log(`✓ 生成 ${built.length} 帧 → 04_提示词全套.md / prompts.json / render_commands.txt`);
if (problems.length) { console.log(`\n⚠ 结构问题 ${problems.length} 条：`); problems.forEach(p => console.log("  - " + p)); }
if (bannedHits.length) { console.log(`\n⚠ 禁用词命中 ${bannedHits.length} 条（会画水印/光柱）：`); bannedHits.forEach(p => console.log("  - " + p)); }
if (!problems.length && !bannedHits.length) console.log("✓ 结构与禁用词检查通过");

const downCount = built.filter(s => s.compo_variant === "down").length;
const sizeOk = (s) => /no taller than|no bigger than|no larger than|smaller than|a small dark|a tiny|a very small|as tall as|face reads clearly|walks toward the camera/i.test(s.fig_anchor_en || "") || s.compo_variant === "ward" || s.lens === "screen";
const figIssues = built.filter(s => !sizeOk(s)).length;
console.log(`\n统计：COMPO_DOWN ${downCount} 帧｜尺寸句缺失 ${figIssues} 帧`);
process.exit(problems.length || bannedHits.length ? 2 : 0);
