// 交叉验证引擎 + 理气计算（八宅命卦 / 宅卦 / 流年飞星 / 南半球修正）
"use strict";

const Metaphysics = (() => {
  function digitSum(n) { let s = 0; for (const c of String(n)) s += +c; return s > 9 ? digitSum(s) : s; }

  // 八宅命卦：男(11-s)，女(s+4)，5男坤女艮
  function mingGua(year, gender) {
    const s = digitSum(year);
    let g = gender === "female" ? s + 4 : 11 - s;
    if (g > 9) g -= 9;
    if (g === 5) g = gender === "female" ? 8 : 2;
    const name = KB.guaNames[g];
    return { num: g, name, group: KB.eastFour.includes(name) ? "东四命" : "西四命" };
  }

  // 宅卦：由坐向决定
  function zhaiGua(sitKey) {
    const g = KB.sitToGua[sitKey];
    if (!g) return null;
    const name = KB.guaNames[g];
    return { num: g, name, group: KB.eastFour.includes(name) ? "东四宅" : "西四宅" };
  }

  // 流年入中飞星
  function liuNianStar(year) {
    let s = 11 - (year % 9);
    if (s > 9) s -= 9;
    return s;
  }

  return { mingGua, zhaiGua, liuNianStar };
})();

const CrossValidator = (() => {
  // 单个发现按矩阵判定
  function judge(f) {
    const s = f.sources;
    const yesCount = ["text", "photo", "video"].filter(k => s[k].state === "yes").length;
    const hasConflict = ["text", "photo", "video"].some(k => s[k].state === "conflict");
    if (hasConflict) return { conclusion: "矛盾", stars: 0, action: "追问澄清", excluded: false };
    if (yesCount === 3) return { conclusion: "确认", stars: 3, action: "正常输出", excluded: false };
    if (yesCount === 2) {
      const missing = { text: "文字确认", photo: "照片", video: "视频" };
      const lack = ["text", "photo", "video"].filter(k => s[k].state !== "yes").map(k => missing[k]).join("、");
      return { conclusion: "倾向", stars: 2, action: `建议补充${lack}`, excluded: false };
    }
    if (yesCount === 1) return { conclusion: "存疑", stars: 1, action: "追问补充（建议补充其他材料）", excluded: false };
    return { conclusion: "排除", stars: 0, action: "证据缺失，不纳入报告", excluded: true };
  }

  function evaluateAll(findings) {
    return findings.map(f => { f.judgement = judge(f); return f; });
  }

  function starsLabel(n) { return n > 0 ? "⭐".repeat(n) : "—"; }

  return { judge, evaluateAll, starsLabel };
})();
