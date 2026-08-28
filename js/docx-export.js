// DOCX 导出器：纯前端零依赖，将报告 Markdown 转为原生 Word 文档（OOXML + 手写 ZIP/STORE）
"use strict";

const DocxExport = (() => {
  const enc = new TextEncoder();

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- ZIP（STORE 无压缩） ----------
  function makeZip(files) {
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);   // local file header 签名
      lh.setUint16(4, 20, true);           // 版本
      lh.setUint16(6, 0x0800, true);       // UTF-8 文件名标志
      lh.setUint16(8, 0, true);            // STORE
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);   // central directory 签名
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);      // 本地头偏移
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    let cdSize = 0; central.forEach(c => cdSize += c.length);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
    const out = new Uint8Array(offset + cdSize + 22);
    let p = 0;
    for (const c of [...chunks, ...central, new Uint8Array(eocd.buffer)]) { out.set(c, p); p += c.length; }
    return out;
  }

  // ---------- XML 工具 ----------
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // 行内 **加粗** 解析 → run XML
  function runs(s, base) {
    const out = [];
    const parts = s.split(/\*\*(.+?)\*\*/g);
    parts.forEach((part, i) => {
      if (!part) return;
      const bold = i % 2 === 1;
      out.push(`<w:r><w:rPr>${bold ? "<w:b/>" : ""}${base || ""}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`);
    });
    return out.join("") || `<w:r><w:rPr>${base || ""}</w:rPr><w:t xml:space="preserve"></w:t></w:r>`;
  }

  const COLOR_INK = "1F2733", COLOR_SUB = "44557A", COLOR_BLUE = "1F56C4", COLOR_PRIMARY = "2F6FED";

  function pTitle(text) {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="6" w:color="${COLOR_PRIMARY}"/></w:pBdr></w:pPr>${runs(text, `<w:sz w:val="36"/><w:szCs w:val="36"/><w:b/><w:color w:val="${COLOR_INK}"/>`)}</w:p>`;
  }
  function pH2(text) {
    return `<w:p><w:pPr><w:spacing w:before="280" w:after="120"/><w:pBdr><w:left w:val="single" w:sz="24" w:space="4" w:color="${COLOR_PRIMARY}"/></w:pBdr></w:pPr>${runs(text, `<w:sz w:val="28"/><w:szCs w:val="28"/><w:b/><w:color w:val="${COLOR_BLUE}"/>`)}</w:p>`;
  }
  function pH3(text) {
    return `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>${runs(text, `<w:sz w:val="24"/><w:szCs w:val="24"/><w:b/><w:color w:val="${COLOR_INK}"/>`)}</w:p>`;
  }
  function pQuote(lines) {
    return lines.map(l => `<w:p><w:pPr><w:spacing w:after="40"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="4" w:color="${COLOR_PRIMARY}"/></w:pBdr><w:shd w:val="clear" w:fill="F0F4FF"/><w:ind w:left="200"/></w:pPr>${runs(l, `<w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="${COLOR_SUB}"/>`)}</w:p>`).join("");
  }
  function pBody(text) {
    return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>${runs(text, `<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="${COLOR_INK}"/>`)}</w:p>`;
  }
  function pBullet(text) {
    return `<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="420" w:hanging="280"/></w:pPr><w:r><w:rPr><w:color w:val="${COLOR_PRIMARY}"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">▪ </w:t></w:r>${runs(text, `<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="${COLOR_INK}"/>`)}</w:p>`;
  }
  function pEmpty() { return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr></w:p>`; }

  function tbl(rows) {
    const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(k => `<w:${k} w:val="single" w:sz="4" w:color="D0DDEF"/>`).join("")}</w:tblBorders>`;
    const cellMar = `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>`;
    let xml = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}${cellMar}</w:tblPr>`;
    rows.forEach((cells, ri) => {
      const isHead = ri === 0;
      const shade = isHead ? "EEF3FC" : (ri % 2 === 0 ? "F6F9FE" : "FFFFFF");
      xml += `<w:tr>`;
      for (const c of cells) {
        xml += `<w:tc><w:tcPr><w:shd w:val="clear" w:fill="${shade}"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runs(c, `<w:sz w:val="19"/><w:szCs w:val="19"/>${isHead ? "<w:b/>" : ""}<w:color w:val="${isHead ? "33487A" : COLOR_INK}"/>`)}</w:p></w:tc>`;
      }
      xml += `</w:tr>`;
    });
    xml += `</w:tbl>`;
    return xml;
  }

  // ---------- Markdown → document.xml ----------
  function mdToDocxXml(md) {
    const lines = md.split("\n");
    const body = [];
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) { i++; continue; }
      if (/^-{3,}$/.test(t)) { body.push(pEmpty()); i++; continue; }
      const hm = t.match(/^(#{1,3})\s+(.+)$/);
      if (hm) {
        body.push(hm[1].length === 1 ? pTitle(hm[2]) : hm[1].length === 2 ? pH2(hm[2]) : pH3(hm[2]));
        i++; continue;
      }
      if (t.startsWith(">")) {
        const block = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          const inner = lines[i].trim().replace(/^>\s?/, "");
          if (inner) block.push(inner);
          i++;
        }
        if (block.length) body.push(pQuote(block));
        continue;
      }
      if (t.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
        const tlines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tlines.push(lines[i].trim()); i++; }
        const parseRow = r => r.split("|").slice(1, -1).map(s => s.trim());
        const rows = [parseRow(tlines[0])];
        for (let j = 2; j < tlines.length; j++) rows.push(parseRow(tlines[j]));
        body.push(tbl(rows), pEmpty());
        continue;
      }
      if (t.startsWith("- ")) {
        while (i < lines.length && lines[i].trim().startsWith("- ")) {
          body.push(pBullet(lines[i].trim().slice(2)));
          i++;
        }
        continue;
      }
      body.push(pBody(t));
      i++;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300"/></w:sectPr></w:body></w:document>`;
  }

  // ---------- 对外：Markdown → docx Blob ----------
  function build(md) {
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const docXml = mdToDocxXml(md);
    const data = makeZip([
      { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
      { name: "_rels/.rels", data: enc.encode(rels) },
      { name: "word/document.xml", data: enc.encode(docXml) }
    ]);
    return new Blob([data], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  return { build };
})();
