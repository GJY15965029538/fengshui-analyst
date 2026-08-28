// 轻量级 Markdown → HTML 渲染器（专为风水报告定制，零依赖）
"use strict";

const MDRenderer = (() => {
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 行内格式：加粗
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return s;
  }

  function render(md) {
    const lines = md.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();

      // 空行
      if (!t) { i++; continue; }

      // 分隔线
      if (/^-{3,}$/.test(t)) { out.push('<hr class="md-hr">'); i++; continue; }

      // 标题
      const hm = t.match(/^(#{1,3})\s+(.+)$/);
      if (hm) {
        const lv = hm[1].length;
        out.push(`<h${lv}>${inline(hm[2])}</h${lv}>`);
        i++; continue;
      }

      // 引用块（连续 > 开头）
      if (t.startsWith(">")) {
        const block = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          block.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        out.push(`<blockquote>${block.map(inline).join("<br>")}</blockquote>`);
        continue;
      }

      // 表格（| 开头，下一行也是 | 分隔行）
      if (t.startsWith("|") && i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
        const tlines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tlines.push(lines[i].trim());
          i++;
        }
        const parseRow = (r) => r.split("|").slice(1, -1).map(s => s.trim());
        const header = parseRow(tlines[0]);
        let tbody = "";
        for (let j = 2; j < tlines.length; j++) {
          const cells = parseRow(tlines[j]);
          tbody += "<tr>" + cells.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>";
        }
        const thead = "<thead><tr>" + header.map(h => `<th>${inline(h)}</th>`).join("") + "</tr></thead>";
        out.push(`<table class="md-table">${thead}<tbody>${tbody}</tbody></table>`);
        continue;
      }

      // 无序列表（- 开头）
      if (t.startsWith("- ")) {
        const items = [];
        while (i < lines.length && lines[i].trim().startsWith("- ")) {
          items.push(lines[i].trim().slice(2));
          i++;
        }
        out.push(`<ul class="md-ul">${items.map(s => `<li>${inline(s)}</li>`).join("")}</ul>`);
        continue;
      }

      // 普通段落
      out.push(`<p>${inline(t)}</p>`);
      i++;
    }

    return out.join("\n");
  }

  return { render };
})();
