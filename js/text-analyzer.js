// 文字分析引擎：口语→术语映射 + 坐向/年份/地域提取
"use strict";

const TextAnalyzer = (() => {
  // 术语 → 化解方案key 别名映射
  const RES_ALIAS = {
    "枪煞": "路冲", "箭煞": "路冲", "照床镜": "镜煞", "镜照门": "镜煞",
    "背门灶": "门冲灶", "开门见灶": "门冲灶", "水火冲": "门冲灶", "水火不相容": "门冲灶",
    "窗下床": "玄武无靠", "中宫设灶": "中宫设厕", "独阴煞": "孤阴煞", "阴煞": "孤阴煞",
    "孤阳煞": "孤阴煞", "角煞": "尖角冲射", "反光煞": "光煞", "电磁煞": "火形煞",
    "割脚煞": "割脚水", "树撞煞": "顶心煞", "形煞": "尖角冲射", "压顶": "尖角冲射",
    "冲射煞": "顶心煞", "牵牛水": "反弓水", "直去水": "反弓水", "污水": "割脚水",
    "秽水": "割脚水", "污水冲射": "割脚水", "声煞": "声煞", "动土煞": "声煞",
    "上下颠倒": "缺角", "火形屋": "缺角", "三角煞": "缺角", "火气上冲": "横梁压顶",
    "冲床": "秽气冲床", "门冲": "开口煞", "背水": "割脚水", "急水": "割脚水",
    "声煞/割脚水": "声煞", "玄武有靠": "玄武无靠"
  };
  // 吉性结论（无化解需求）
  const POSITIVE = new Set(["靠山", "玄武有靠", "明堂开阔", "环抱水", "玉带水", "明堂聚水", "见水", "青龙方", "白虎方", "朝空", "面虚", "坐实"]);
  const POS_QUOTE = {
    "靠山": ["葬书", "玄武垂头"], "玄武有靠": ["葬书", "玄武垂头"],
    "明堂开阔": ["葬书", "明堂容万马，富贵传天下"], "环抱水": ["水龙经", "玉带环腰，富贵滔滔"],
    "玉带水": ["水龙经", "玉带环腰，富贵滔滔"], "明堂聚水": ["葬书", "得水为上，藏风次之"]
  };

  function normalize(s) {
    return (s || "").toLowerCase().replace(/[\s"“”'‘’、,，。；;：:！!？?\.\(\)（）]/g, "");
  }

  // 停用词：从短语中剔除功能词，保留内容词
  const STOP = ["上面", "上方", "下面", "下方", "旁边", "中间", "正对", "对着", "靠着", "看到", "看见", "过来", "出去", "直直", "一样", "是", "的", "了", "很", "有", "在", "着", "条", "个", "座", "栋", "间", "像"];
  function stripStop(s) {
    let out = s;
    for (const w of STOP) out = out.split(w).join("");
    return out;
  }
  function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return [...set];
  }

  // 口语变体模糊匹配：精确子串 → 内容词全含 → 二元组覆盖率+首词锚定
  function saidIn(sayingRaw, targetNorm) {
    if (!targetNorm) return false;
    const s = normalize(sayingRaw);
    if (!s) return false;
    if (targetNorm.includes(s)) return true;
    const clean = stripStop(s);
    const src = bigrams(clean.length >= 4 ? clean : s);
    if (!src.length) return false;
    let hit = 0;
    for (const bg of src) if (targetNorm.includes(bg)) hit++;
    const anchor = (clean.length >= 2 ? clean : s).slice(0, 2);
    return hit / src.length >= 0.6 && targetNorm.includes(anchor);
  }

  // 主函数：文本 → 发现清单
  function analyze(text) {
    const norm = normalize(text);
    // 分句保留原始证据
    const clauses = (text || "").split(/[。；;！!？?\n]+/).map(s => s.trim()).filter(Boolean);
    const found = [];
    const seenTerm = new Set();

    for (const t of KB.terms) {
      if (!saidIn(t.saying, norm)) continue;
      const hitClause = clauses.find(c => saidIn(t.saying, normalize(c))) || "（全文匹配）";

      const canonical = t.term.split("/")[0].trim();
      const dedupKey = canonical + "|" + t.cat;
      if (seenTerm.has(dedupKey)) continue;
      seenTerm.add(dedupKey);

      const resKey = RES_ALIAS[canonical] || canonical;
      const positive = POSITIVE.has(canonical);
      found.push({
        name: canonical,
        cat: t.cat,
        saying: t.saying,
        note: t.note,
        positive,
        resKey,
        risk: positive ? 0 : (KB.resolutions[resKey] ? KB.resolutions[resKey].risk : 1),
        sources: {
          text:  { state: "yes", evidence: hitClause },
          photo: { state: "absent", evidence: "" },
          video: { state: "absent", evidence: "" }
        }
      });
    }

    return {
      findings: found,
      meta: extractMeta(text)
    };
  }

  // 附加信息提取：朝向 / 出生年 / 入宅年 / 地域半球
  function extractMeta(text) {
    const meta = { facing: null, birthYears: [], moveYear: null, buildYear: null, hemisphere: null, regionHit: null };
    const sit = text.match(/坐([东南西北]{1,2})朝([东南西北]{1,2})/);
    if (sit) { meta.facing = dirKey(sit[2]); }
    if (!meta.facing) {
      const m = text.match(/(?:大门|阳台|门|窗|房子|住宅|楼)[^\u4e00-\u9fa5]{0,4}朝([东南西北]{1,2})/) || text.match(/朝([东南西北]{1,2})/) || text.match(/向([东南西北]{1,2})/);
      if (m) meta.facing = dirKey(m[1]);
    }
    const years = text.match(/(19[5-9]\d|20[0-2]\d)\s*年\s*(生|出生)?/g) || [];
    for (const y of years) {
      const n = parseInt(y);
      if (/生|出生/.test(y) && n >= 1940 && n <= 2025) meta.birthYears.push(n);
      else if (/搬|入住|住进|装修/.test(text.slice(Math.max(0, text.indexOf(y) - 6), text.indexOf(y) + y.length + 4))) meta.moveYear = n;
      else if (/建|盖|落成/.test(text.slice(Math.max(0, text.indexOf(y) - 6), text.indexOf(y) + y.length + 4))) meta.buildYear = n;
    }
    // 半球自动识别
    const n = normalize(text);
    for (const r of KB.global.southHemisphere) if (n.includes(r.toLowerCase())) { meta.hemisphere = "south"; meta.regionHit = r; break; }
    if (!meta.hemisphere) for (const r of KB.global.northHemisphere) if (n.includes(r.toLowerCase())) { meta.hemisphere = "north"; meta.regionHit = r; break; }
    return meta;
  }

  function dirKey(cn) {
    for (const [k, v] of Object.entries(KB.facingNames)) if (v === cn) return k;
    return null;
  }

  return { analyze, extractMeta, normalize, POS_QUOTE };
})();
