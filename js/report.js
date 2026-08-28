// 报告生成器：按 report-template.md 十二节结构输出 Markdown
"use strict";

const ReportGenerator = (() => {
  const SRC = ["text", "photo", "video"];
  const SRC_NAME = { text: "文字", photo: "照片", video: "视频" };

  function sym(state) { return state === "yes" ? "✅" : state === "conflict" ? "⚠️矛盾" : state === "no" ? "❌未见" : "—"; }

  function quoteOf(f) {
    if (f.positive && TextAnalyzer.POS_QUOTE[f.name]) return TextAnalyzer.POS_QUOTE[f.name];
    const r = KB.resolutions[f.resKey];
    return r && r.quote ? r.quote : null;
  }

  function sectionOf(f) {
    if (f.sci) return "sci";
    if (f.cat === "水体环境类") return "water";
    if (f.cat === "室内布局类") return "indoor";
    if (f.cat === "方位坐向类") return "liqi";
    if (f.cat === "外部环境类" || f.cat === "现代人造物类") return f.positive || ["玄武无靠", "明堂受阻", "缺角"].includes(f.name) ? "luantou" : "sha";
    return "luantou";
  }

  function riskName(level) { return KB.riskMeta[level] ? KB.riskMeta[level].name : "一般风险"; }

  function build(state) {
    const fs = state.findings.filter(f => !f.judgement.excluded);
    const active = fs.filter(f => f.judgement.conclusion !== "矛盾");
    const conflicts = fs.filter(f => f.judgement.conclusion === "矛盾");
    // 排序：风险高在前，同级置信度高在前
    active.sort((a, b) => (b.risk - a.risk) || (b.judgement.stars - a.judgement.stars));
    const L = [];
    const now = new Date();
    const b = state.basic;

    // ===== 头部 =====
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const seq = String(Math.floor(Math.random()*9000)+1000);
    L.push("# 📜 环境综合分析报告", "");
    L.push(`> **报告编号**：FS-${dateStr}-${seq}　|　**版本**：V3.1`);
    L.push(`> **分析方式**：本地浏览器离线分析，数据未上传任何服务器`);
    L.push(`> **生成时间**：${now.toLocaleString("zh-CN")}`);
    L.push(`> **数据来源**：${state.text ? "文字描述" : "无文字"} + ${state.photos.length}张照片 + ${state.videos.length}段视频`);
    const adapt = [];
    if (b.region) adapt.push(b.region);
    if (b.hemisphere === "south") adapt.push("南半球（已应用修正）");
    if (b.hemisphere === "north") adapt.push("北半球");
    if (b.climate) adapt.push(KB.global.climates.find(c => c.key === b.climate)?.name || "");
    if (b.culture) adapt.push(KB.global.cultures.find(c => c.key === b.culture)?.name || "");
    if (adapt.some(Boolean)) L.push(`> **已自动适配**：${adapt.filter(Boolean).join(" / ")}`);
    if (b.buildingType) { const bt = KB.buildingTypes.find(x => x.code === b.buildingType); if (bt) L.push(`> **建筑类型**：${bt.code} ${bt.name}（分析重点：${bt.focus}）`); }
    L.push("", "---", "");

    // ===== 综合环境评级 =====
    const geoOn = ["seismic", "flood", "landslide"].filter(k => state.geo[k]);
    let score = 100;
    let redCount = 0, orangeCount = 0, yellowCount = 0, greenCount = 0;
    for (const f of active) {
      if (f.positive) { score += 5; continue; }
      if (f.risk === 3) { score -= 30; redCount++; }
      else if (f.risk === 2) { score -= 15; orangeCount++; }
      else if (f.risk === 1) { score -= 5; yellowCount++; }
      else { greenCount++; }
    }
    const posCount = active.filter(f => f.positive).length;
    score = Math.min(score, 120);
    score = Math.max(score, 0);
    if (geoOn.length) score -= 10;
    let grade, gradeDesc;
    if (score >= 85) { grade = "A级"; gradeDesc = "优秀：环境格局良好，仅有少量可优化项"; }
    else if (score >= 70) { grade = "B级"; gradeDesc = "良好：存在部分需注意的形煞或布局问题"; }
    else if (score >= 50) { grade = "C级"; gradeDesc = "需改善：有多项需处理的风险因素"; }
    else { grade = "D级"; gradeDesc = "需重视：存在红色预警或多项高风险项"; }
    L.push("## 📊 综合环境评级", "");
    L.push(`> **${grade}**　综合评分：${score}/100　${gradeDesc}`);
    L.push("");
    L.push("| 评级 | 含义 | 说明 |");
    L.push("|---|---|---|");
    L.push("| A级 | 优秀 | 环境格局良好，仅有少量可优化项 |");
    L.push("| B级 | 良好 | 存在部分需注意的形煞或布局问题 |");
    L.push("| C级 | 需改善 | 有多项需处理的风险因素 |");
    L.push("| D级 | 需重视 | 存在红色预警或多项高风险项 |");
    L.push("", "**评分构成**：基础100分 + 风险扣分（🔴-30/🟠-15/🟡-5/🟢0）+ 优势加分（每项吉象+5，上限+20）", "");
    L.push("---", "");

    // ===== 环境优势项汇总 =====
    const positives = active.filter(f => f.positive);
    if (positives.length) {
      L.push("## 🟢 环境优势项汇总", "");
      L.push("| 序号 | 优势项 | 来源 | 说明 | 典籍依据 |");
      L.push("|---|---|---|---|---|");
      let pi = 0;
      for (const f of positives) {
        pi++;
        const src = f.sources.text.state === "yes" ? "文字" : f.sources.photo.state === "yes" ? "照片" : "视频";
        const q = quoteOf(f);
        L.push(`| ${pi} | ${f.name} | ${src} | ${f.note || ""} | ${q ? `《${q[0]}》` : "—"} |`);
      }
      L.push("");
      L.push("---", "");
    }

    // ===== 地质红色预警（置顶）=====
    if (geoOn.length) {
      const names = { seismic: "地震带", flood: "洪水/海啸", landslide: "滑坡/软土地基" };
      L.push("> ## 🔴 红色预警（最高优先级）", ">");
      L.push(`> 您确认所处区域存在：**${geoOn.map(k => names[k]).join("、")}** 风险。`);
      L.push("> 地质与结构安全优先于一切风水建议，请务必：");
      L.push("> 1. 查询当地应急管理部门发布的灾害风险地图与避难场所；");
      L.push("> 2. 房屋选购/装修前委托专业机构进行地质与结构勘察；");
      L.push("> 3. 熟悉逃生路线，配置应急包。");
      L.push("> 📍 参考高风险区域：" + geoOn.map(k => KB.geoRegions[k]).join("；"));
      L.push("", "---", "");
    }

    // ===== 证据链摘要（置顶）=====
    L.push("## 🔗 证据链摘要", "");
    L.push("| 判断结论 | 文字依据 | 照片依据 | 视频依据 | 综合置信度 | 风险等级 |");
    L.push("|---|---|---|---|---|---|");
    for (const f of active) {
      L.push(`| ${f.name} | ${sym(f.sources.text.state)} | ${sym(f.sources.photo.state)} | ${sym(f.sources.video.state)} | ${CrossValidator.starsLabel(f.judgement.stars)} | ${riskName(f.risk)} |`);
    }
    if (!active.length) L.push("| （暂无有效结论） | — | — | — | — | — |");
    L.push("", "**图例**：✅有明确证据　⚠️部分证据/矛盾　❌证据缺失　—未涉及", "");
    L.push("**置信度图例**：⭐⭐⭐高（三方一致/经典共识）　⭐⭐中（两方一致/经典依据）　⭐低（单方信息/AI推测）", "");

    // ===== 需确认/补充事项 =====
    if (conflicts.length || active.some(f => f.judgement.stars < 3)) {
      L.push("---", "", "## ⚠️ 需要您确认/补充的事项", "");
      for (const f of conflicts) {
        L.push(`- **矛盾｜${f.name}**：文字「${f.sources.text.evidence || "无"}」，照片「${f.sources.photo.evidence || "无"}」，视频「${f.sources.video.evidence || "无"}」——请核实后修正勾选再重新生成。`);
      }
      for (const f of active.filter(f => f.judgement.stars < 3 && !f.sci)) {
        L.push(`- **${f.judgement.conclusion}｜${f.name}**：${f.judgement.action}`);
      }
      L.push("");
    }

    // ===== 一、基本信息 =====
    L.push("---", "", "## 一、🔍 基本信息综合提取", "");
    L.push("| 信息项 | 内容 | 来源 |");
    L.push("|---|---|---|");
    const info = [
      ["地域", b.region || "未提供", b.region === state.metaRegion ? "文字识别" : "用户填写"],
      ["半球", b.hemisphere === "south" ? "南半球" : b.hemisphere === "north" ? "北半球" : "未确定", state.autoHemisphere ? "自动识别" : "用户确认"],
      ["气候类型", b.climate ? KB.global.climates.find(c => c.key === b.climate)?.name : "未提供", "用户选择"],
      ["文化模式", b.culture ? KB.global.cultures.find(c => c.key === b.culture)?.name : "中性模式", "用户选择"],
      ["建筑类型", b.buildingType ? (() => { const bt = KB.buildingTypes.find(x => x.code === b.buildingType); return bt ? `${bt.code} ${bt.name}` : b.buildingType; })() : "未提供", "用户选择"],
      ["大门/阳台朝向", b.facing ? `${KB.facingNames[b.facing]}（坐${KB.facingNames[KB.facingToSit[b.facing]]}）` : "未提供（理气排盘已跳过，仅做峦头形煞分析）", state.autoFacing ? "文字识别" : "用户填写"],
      ["建造年份", b.buildYear || "未提供", "用户填写"],
      ["入住年份", b.moveYear || "未提供", "用户填写"]
    ];
    for (const row of info) L.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
    L.push("");

    // ===== 二~六：分类三段式 =====
    const secDefs = [
      ["luantou", "二、⛰️ 峦头与环境综合评估"],
      ["sha", "三、⚡ 形煞综合检测"],
      ["water", "四、🌊 水法分析"],
      ["indoor", "六、🏠 室内布局评估"]
    ];
    for (const [key, title] of secDefs) {
      const items = active.filter(f => sectionOf(f) === key);
      if (!items.length) continue;
      L.push("---", "", `## ${title}`, "");
      if (key === "sha") {
        L.push("**已确认/倾向形煞**", "");
        L.push("| 形煞名称 | 文字 | 照片 | 视频 | 综合 | 风险 |");
        L.push("|---|---|---|---|---|---|");
        for (const f of items) L.push(`| ${f.name} | ${sym(f.sources.text.state)} | ${sym(f.sources.photo.state)} | ${sym(f.sources.video.state)} | ${f.judgement.conclusion} | ${riskName(f.risk)} |`);
        L.push("");
      }
      let i = 0;
      for (const f of items) {
        if (key === "sha" && i === 0) { i++; continue; }
        i++;
        L.push(`**【综合判断${i}】${f.name}**　${riskName(f.risk)}`);
        L.push(`- 文字：${f.sources.text.state === "yes" ? `“${f.sources.text.evidence}”` : sym(f.sources.text.state)}`);
        L.push(`- 照片：${f.sources.photo.state === "yes" ? f.sources.photo.evidence || "用户确认可见" : sym(f.sources.photo.state)}${f.sources.photo.evidence && f.sources.photo.state === "yes" ? "" : ""}`);
        L.push(`- 视频：${f.sources.video.state === "yes" ? f.sources.video.evidence || "用户确认可见" : sym(f.sources.video.state)}`);
        L.push(`- ➡️ 结论：${f.note || ""}（${f.judgement.conclusion}，${CrossValidator.starsLabel(f.judgement.stars)}）`);
        if (f.judgement.action && f.judgement.action !== "正常输出") L.push(`- 系统提示：${f.judgement.action}`);
        const q = quoteOf(f);
        if (q) L.push(`- 📖 引用自《${q[0]}》：“${q[1]}”${classicExplain(q)}，传统认为此象${f.positive ? "为吉，宜保持" : "需留意"}。`);
        L.push("");
      }
    }

    // ===== 五、理气 =====
    const liqiItems = active.filter(f => sectionOf(f) === "liqi");
    if (b.facing || liqiItems.length) {
      L.push("---", "", "## 五、🧭 理气与方位分析", "");
      if (b.facing) {
        const sit = KB.facingToSit[b.facing];
        L.push(`- 朝向：大门/阳台朝**${KB.facingNames[b.facing]}**，即**坐${KB.facingNames[sit]}朝${KB.facingNames[b.facing]}**`);
        const zg = Metaphysics.zhaiGua(sit);
        if (zg) L.push(`- 宅卦：**${zg.name}宅（${zg.group}）**`);
        if (b.hemisphere === "south") {
          L.push("- 🌍 **南半球修正已应用**：");
          for (const [k, v] of KB.global.southFix) L.push(`  - ${k}：${v}`);
        }
        const ys = now.getFullYear();
        L.push(`- ${ys} 年流年入中飞星：**${KB.starNames[Metaphysics.liuNianStar(ys)]}**`);
        if (state.people.length && zg) {
          L.push("- 命宅匹配：见「八、人物配命」");
        }
      } else {
        L.push("- 未提供朝向：按规则跳过理气排盘，仅做峦头形煞分析，标注“待补充”。可用手机指南针APP——站大门外、面朝门外读取方向。");
      }
      for (const f of liqiItems) L.push(`- ${f.name}：${f.sources.text.evidence || ""}（${f.judgement.conclusion} ${CrossValidator.starsLabel(f.judgement.stars)}）`);
      L.push("");
    }

    // ===== 七、时空维度 =====
    if (b.moveYear || b.buildYear || b.facing) {
      L.push("---", "", "## 七、⏰ 时空维度", "");
      const ys = now.getFullYear();
      L.push(`- 今年（${ys}）流年飞星：**${KB.starNames[Metaphysics.liuNianStar(ys)]}** 入中。`);
      if (b.moveYear) L.push(`- 入住年份 ${b.moveYear}，已居住约 ${ys - b.moveYear} 年，环境适应期已过，可对照自检清单评估调整效果。`);
      if (b.buildYear) L.push(`- 建造年份 ${b.buildYear}（房龄约 ${ys - b.buildYear} 年），房龄较长建议重点做结构安全检查（见科学维度）。`);
      L.push("> 传统理气流派众多，飞星推演仅供参考（低置信度）。", "");
    }

    // ===== 八、人物配命 =====
    if (state.people.length) {
      L.push("---", "", "## 八、👤 人物配命", "");
      const zg = b.facing ? Metaphysics.zhaiGua(KB.facingToSit[b.facing]) : null;
      L.push("| 居住者 | 出生年份 | 命卦 | 命局 | 与本宅匹配 |");
      L.push("|---|---|---|---|---|");
      for (const p of state.people) {
        const mg = Metaphysics.mingGua(p.year, p.gender);
        let match = "待补充朝向";
        if (zg) {
          const same = (mg.group === "东四命") === (zg.group === "东四宅");
          match = same ? `✅ 相配（${mg.group}配${zg.group}）` : `⚠️ 不相配（${mg.group}配${zg.group}，可在卧床/书桌方位上取本命吉方调节）`;
        }
        L.push(`| ${p.label || "成员"} | ${p.year} | ${mg.name} | ${mg.group} | ${match} |`);
      }
      L.push("", "> 📖 引用自《八宅明镜》：“东四命宜居东四宅，西四命宜居西四宅”——命卦与宅卦同组为配。", "");
    }

    // ===== 九、科学维度 =====
    const sci = active.filter(f => sectionOf(f) === "sci");
    const geoHit = ["seismic", "flood", "landslide"].filter(k => state.geo[k]);
    if (sci.length || geoHit.length) {
      L.push("---", "", "## 九、🔬 科学维度独立评估", "");
      L.push("| 评估项 | 判断依据 | 结论 | 风险 |");
      L.push("|---|---|---|---|");
      for (const f of sci) L.push(`| ${f.name} | ${f.sources.photo.state === "yes" ? "照片量化" : ""}${f.sources.video.state === "yes" ? (f.sources.photo.state === "yes" ? "+视频量化" : "视频量化") : ""} | ${f.note || ""} | ${riskName(f.risk)} |`);
      if (geoHit.length) {
        const names = { seismic: "地震带", flood: "洪水/海啸", landslide: "滑坡/软土地基" };
        L.push(`| 地质安全 | 用户自检确认 | 所在区域存在${geoHit.map(k => names[k]).join("/")}风险，务必遵从当地应急管理部门指引 | 🔴 红色预警 |`);
      }
      L.push("");
    }

    // ===== 十、行动清单 =====
    const actionable = active.filter(f => !f.positive && !f.sci && KB.resolutions[f.resKey]);
    if (actionable.length) {
      L.push("---", "", "## 十、📋 优先级行动清单", "");
      let pri = 0;
      for (const f of actionable.sort((a, b) => b.risk - a.risk)) {
        const r = KB.resolutions[f.resKey];
        pri++;
        const tag = ["🟢", "🟡", "🟠", "🔴"][f.risk];
        L.push(`**【第${pri}优先级】${f.name}** ${tag} ${riskName(f.risk)}`, "");
        L.push(`- 证据支撑：文字${sym(f.sources.text.state)} + 照片${sym(f.sources.photo.state)} + 视频${sym(f.sources.video.state)}（${f.judgement.conclusion}，${CrossValidator.starsLabel(f.judgement.stars)}）`);
        L.push(`- 通俗解释：${f.note || ""}${f.note ? "。" : ""}${f.name}是传统风水中的典型格局，建议按下方方案视情况处理。`);
        const planTag = ["A方案-最佳", "B方案-替代", "C方案-过渡"];
        const effects = ["从根本上化解形煞不利影响", "有效缓解对冲格局，改善居住舒适度", "低成本过渡，心理层面缓冲"];
        r.plans.forEach((p, idx) => L.push(`- **【${planTag[idx]}】**${p[0]}：${p[1]}，预估成本${p[2]}，工期${p[3]}，预期${effects[idx] || "逐步改善"}`));
        const q = r.quote;
        if (q) L.push(`- 📖 引用自《${q[0]}》：“${q[1]}”${classicExplain(q)}`);
        L.push("");
      }
    }

    // ===== 十一、补充建议 =====
    const missing = [];
    if (!state.photos.some(p => p.cover === "left")) missing.push(["左侧环境（青龙方）", "无法判断左侧环境", "站在大门往左拍一张"]);
    if (!state.photos.some(p => p.cover === "right")) missing.push(["右侧环境（白虎方）", "无法判断右侧环境", "站在大门往右拍一张"]);
    if (!state.photos.some(p => p.cover === "front")) missing.push(["前方外景（明堂）", "无法判断明堂与外局形煞", "从阳台/窗户往外拍一张"]);
    if (!state.photos.some(p => p.cover === "kitchen")) missing.push(["厨房全景", "无法确认灶台方位与门灶关系", "站在厨房门口拍全景"]);
    if (!state.videos.length) missing.push(["环拍视频", "无法交叉验证动态环境", "手持手机环绕房间拍一圈"]);
    if (missing.length) {
      L.push("---", "", "## 十一、📷 补充建议汇总", "");
      L.push("| 缺失场景 | 当前影响 | 建议补充 |");
      L.push("|---|---|---|");
      for (const m of missing) L.push(`| ${m[0]} | ${m[1]} | ${m[2]} |`);
      L.push("");
    }

    // ===== 十二、30天自检 =====
    L.push("---", "", "## 十二、✅ 30天自检验证清单", "");
    L.push("| 验证项 | 改善前 | 30天后 | 60天后 |");
    L.push("|---|---|---|---|");
    L.push("| 睡眠质量 | ①入睡难 ②多梦 ③早醒 ④无不适 | ________ | ________ |");
    L.push("| 精力状态 | ①常疲倦 ②一般 ③精力充沛 | ________ | ________ |");
    L.push("| 家庭和谐度 | ①常争吵 ②偶有不和 ③和谐 | ________ | ________ |");
    L.push("| 事业/学业 | ①不顺 ②平淡 ③顺利 | ________ | ________ |");
    L.push("| 财运感受 | ①支出多 ②平稳 ③有盈余 | ________ | ________ |");
    L.push("| 整体舒适感 | ①压抑 ②一般 ③舒适 | ________ | ________ |");
    L.push("", "> 💡 调整后给自己30天适应期，60天再来对比感受。风水调整是渐进过程，非一日之功。", "");

    // ===== 报告总结 =====
    const totalIssues = redCount + orangeCount + yellowCount + greenCount;
    const topIssue = actionable.length ? actionable.sort((a, b) => b.risk - a.risk)[0].name : "无";
    L.push("---", "", "## 📝 报告总结", "");
    L.push(`> 综合以上 ${active.length} 项分析，您的环境存在 **${totalIssues}项需关注问题**（其中🔴红色预警 ${redCount}项、🟠较高 ${orangeCount}项、🟡一般 ${yellowCount}项）${posCount ? `和 **${posCount}项环境优势**` : "，暂未发现明显环境优势"}。`);
    L.push(">");
    L.push(`> 综合评级：**${grade}（${score}/100）**。`);
    L.push(">");
    if (redCount > 0) {
      L.push(`> 建议优先处理红色预警项，其余可按优先级逐步调整。每项行动清单均提供A/B/C三套方案，可根据预算和工期灵活选择。`);
    } else if (actionable.length) {
      L.push(`> 建议优先处理「${topIssue}」，其余可按优先级逐步调整。每项行动清单均提供A/B/C三套方案，可根据预算和工期灵活选择。`);
    } else {
      L.push(`> 当前环境格局良好，暂无紧急需处理的问题。可关注日常优化项，保持良好的居住习惯。`);
    }
    L.push(">");
    L.push("> 风水之道，贵在顺势而为、循序渐进。调整后保持30-60天观察期，再评估效果。");
    L.push("");

    // ===== 免责声明 =====
    L.push("---", "", "> 📌 **免责声明**：", ">");
    L.push("> - 本报告由本地离线程序基于传统民俗文化理论生成，每条结论已标注置信度。");
    L.push("> - ⭐为AI/程序推演，⭐⭐为有经典依据但存流派差异，⭐⭐⭐为多源交叉验证。");
    L.push("> - 照片/视频量化分析仅提取亮度、动态、响度等统计特征，不等于专业视觉识别，请以实地勘察为准。");
    L.push("> - 凡涉及地质/结构/消防安全的🔴红色预警，请务必遵从当地专业部门指引。");
    L.push("> - 本报告仅供参考，重大决策请咨询专业地理师实地勘测。");

    return L.join("\n");
  }

  function classicExplain(q) {
    for (const c of KB.classics) if (c.book === q[0]) {
      const hit = c.quotes.find(x => x.text.includes(q[1]) || q[1].includes(x.text));
      if (hit && hit.explain) return `，意为${hit.explain}`;
    }
    return "";
  }

  return { build };
})();
