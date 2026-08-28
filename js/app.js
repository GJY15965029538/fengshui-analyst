// 主控：四步向导状态机 + 界面渲染
"use strict";

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    text: "", textAnalyzed: "",
    photos: [], videos: [], findings: [], people: [],
    basic: { region: "", hemisphere: "", climate: "", culture: "", buildingType: "", facing: "", floor: "", buildYear: "", moveYear: "" },
    geo: { seismic: false, flood: false, landslide: false },
    autoHemisphere: false, autoFacing: false, metaRegion: null
  };
  let uid = 0;
  const nextId = () => ++uid;

  // ---------- 初始化 ----------
  function init() {
    fillSelect("fClimate", KB.global.climates.map(c => [c.key, c.name]));
    fillSelect("fCulture", KB.global.cultures.map(c => [c.key, c.name]));
    fillSelect("fBuilding", KB.buildingTypes.map(b => [b.code, `${b.code} ${b.name}`]));
    fillSelect("fFacing", Object.entries(KB.facingNames).map(([k, v]) => [k, `朝${v}`]));
    $("geoRef").innerHTML = Object.entries(KB.geoRegions).map(([k, v]) => {
      const n = { seismic: "地震带：", flood: "洪水/海啸：", landslide: "滑坡/软基：" }[k];
      return `<p><b>${n}</b>${v}</p>`;
    }).join("");

    // 事件
    $("photoPick").onclick = () => $("photoInput").click();
    $("videoPick").onclick = () => $("videoInput").click();
    bindDrop($("photoZone"), $("photoInput"), files => addPhotos(files));
    bindDrop($("videoZone"), $("videoInput"), files => addVideos(files));
    $("btnSample").onclick = () => { $("textInput").value = SAMPLE; toast("已填入示例描述"); };
    $("btnClearText").onclick = () => { $("textInput").value = ""; };
    $("btnAddPerson").onclick = addPersonRow;
    $("toStep2").onclick = goStep2;
    $("back1").onclick = () => showStep(1);
    $("toStep3").onclick = goStep3;
    $("back2").onclick = () => showStep(2);
    $("toStep4").onclick = goStep4;
    $("back3").onclick = () => showStep(3);
    $("btnDownload").onclick = downloadMD;
    $("btnPrint").onclick = () => window.print();
    $("btnCopy").onclick = copyReport;
    $("btnRestart").onclick = () => location.reload();
    $("btnAddFinding").onclick = addManualFinding;
    addPersonRow();
  }

  const SAMPLE = "我家在澳大利亚悉尼，大门朝北，自建房三层。窗外有条弯弯的河绕过来，但门口正对一条直路，对面两栋楼中间有条缝对着客厅。卧室床头上面有横梁，大门进来正对窗户，1985年出生的我住在这里，今年刚搬进来。";

  function fillSelect(id, pairs) {
    const sel = $(id);
    for (const [v, t] of pairs) {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      sel.appendChild(o);
    }
  }

  function bindDrop(zone, input, handler) {
    zone.onclick = (e) => { if (e.target.tagName !== "INPUT") input.click(); };
    input.onchange = () => { handler([...input.files]); input.value = ""; };
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("drag"); };
    zone.ondragleave = () => zone.classList.remove("drag");
    zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("drag"); handler([...e.dataTransfer.files]); };
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  // ---------- 步骤切换 ----------
  function showStep(n) {
    for (let i = 1; i <= 4; i++) $("step" + i).classList.toggle("hidden", i !== n);
    document.querySelectorAll(".step").forEach(s => s.classList.toggle("active", +s.dataset.step === n));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Step1 → Step2 ----------
  function goStep2() {
    state.text = $("textInput").value.trim();
    if (!state.text && !state.photos.length && !state.videos.length) {
      toast("请先提供文字描述、照片或视频中的至少一项");
      return;
    }
    if (state.text && state.text !== state.textAnalyzed) {
      const { findings, meta } = TextAnalyzer.analyze(state.text);
      state.findings = findings;
      state.textAnalyzed = state.text;
      state.autoFacing = !!meta.facing;
      state.autoHemisphere = !!meta.hemisphere;
      state.metaRegion = meta.regionHit;
      if (meta.facing) state.basic.facing = meta.facing;
      if (meta.hemisphere) state.basic.hemisphere = meta.hemisphere;
      if (meta.regionHit) state.basic.region = meta.regionHit;
      if (meta.moveYear) state.basic.moveYear = meta.moveYear;
      if (meta.buildYear) state.basic.buildYear = meta.buildYear;
      if (meta.birthYears.length && state.people.length === 1 && !state.people[0].year) {
        state.people[0].year = meta.birthYears[0];
      }
      renderBasicForm();
      toast(`文字分析完成：识别到 ${findings.length} 项发现${meta.regionHit ? `，地域「${meta.regionHit}」` : ""}`);
    }
    showStep(2);
  }

  // ---------- Step2 表单 ----------
  function renderBasicForm() {
    const b = state.basic;
    $("fRegion").value = b.region || ""; $("fHemi").value = b.hemisphere || "";
    $("fClimate").value = b.climate || ""; $("fCulture").value = b.culture || "";
    $("fBuilding").value = b.buildingType || ""; $("fFacing").value = b.facing || "";
    $("fFloor").value = b.floor || ""; $("fBuildYear").value = b.buildYear || ""; $("fMoveYear").value = b.moveYear || "";
  }

  function collectBasic() {
    const b = state.basic;
    b.region = $("fRegion").value.trim();
    b.hemisphere = $("fHemi").value;
    if ($("fHemi").value) state.autoHemisphere = false;
    b.climate = $("fClimate").value; b.culture = $("fCulture").value;
    b.buildingType = $("fBuilding").value; b.facing = $("fFacing").value;
    if ($("fFacing").value) state.autoFacing = false;
    b.floor = $("fFloor").value; b.buildYear = $("fBuildYear").value; b.moveYear = $("fMoveYear").value;
    state.geo = { seismic: $("geoSeismic").checked, flood: $("geoFlood").checked, landslide: $("geoLand").checked };
  }

  function addPersonRow(p) {
    p = p || { label: "", year: "", gender: "male" };
    state.people.push(p);
    const div = document.createElement("div");
    div.className = "person-row";
    div.innerHTML = `
      <label>称谓<input placeholder="如：本人/妻子" value="${p.label}"></label>
      <label>出生年份<input type="number" min="1940" max="2025" placeholder="如 1985" value="${p.year}"></label>
      <label>性别<select><option value="male">男</option><option value="female">女</option></select></label>
      <button class="btn small" title="删除">✕</button>`;
    const [lInput, yInput, gSel, del] = div.querySelectorAll("input,select,button");
    lInput.oninput = () => p.label = lInput.value;
    yInput.oninput = () => p.year = yInput.value;
    gSel.onchange = () => p.gender = gSel.value;
    del.onclick = () => { div.remove(); state.people.splice(state.people.indexOf(p), 1); };
    if (p.year) yInput.value = p.year;
    if (p.gender === "female") gSel.value = "female";
    $("peopleList").appendChild(div);
  }

  // ---------- 媒体文件 ----------
  function addPhotos(files) {
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) { toast("请选择图片文件"); return; }
    for (const f of imgs) {
      const p = { id: nextId(), file: f, name: f.name, thumb: "", cover: "", stats: null, derived: [], done: false };
      state.photos.push(p);
      MediaAnalyzer.analyzePhoto(f).then(r => {
        Object.assign(p, { thumb: r.thumb, stats: r.stats, derived: r.derived, done: true });
        renderThumbs();
      }).catch(() => { toast(`图片 ${f.name} 解析失败，已移除`); state.photos.splice(state.photos.indexOf(p), 1); renderThumbs(); });
    }
    renderThumbs();
  }

  function addVideos(files) {
    const vids = files.filter(f => f.type.startsWith("video/"));
    if (!vids.length) { toast("请选择视频文件"); return; }
    for (const f of vids) {
      const v = { id: nextId(), file: f, name: f.name, thumbs: [], stats: null, derived: [], done: false };
      state.videos.push(v);
      renderThumbs();
    }
    toast("视频已加入，将在下一步开始分析时处理");
  }

  function renderThumbs() {
    // 照片
    const pt = $("photoThumbs");
    pt.innerHTML = "";
    for (const p of state.photos) {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `
        <button class="t-del" title="移除">✕</button>
        ${p.thumb ? `<img src="${p.thumb}">` : `<img alt=""><div class="t-tag">⏳ 待本地解析</div>`}
        <div class="t-name" title="${p.name}">${p.name}</div>
        <select title="拍摄场景（用于补充建议判断）">
          <option value="">标注场景…</option>
          <option value="front">前方外景（明堂）</option>
          <option value="left">左侧（青龙方）</option>
          <option value="right">右侧（白虎方）</option>
          <option value="kitchen">厨房全景</option>
          <option value="room">室内房间</option>
          <option value="plan">户型图</option>
        </select>
        ${p.stats ? `<div class="t-tag">亮度 ${p.stats.lum.toFixed(0)} · 对比 ${p.stats.contrast.toFixed(0)} · 边缘 ${p.stats.edge.toFixed(0)}</div>` : ""}`;
      const [del, , sel] = [d.querySelector(".t-del"), null, d.querySelector("select")];
      sel.value = p.cover;
      sel.onchange = () => p.cover = sel.value;
      del.onclick = () => { state.photos.splice(state.photos.indexOf(p), 1); renderThumbs(); };
      pt.appendChild(d);
    }
    // 视频
    const vt = $("videoThumbs");
    vt.innerHTML = "";
    for (const v of state.videos) {
      const d = document.createElement("div");
      d.className = "thumb";
      const film = v.thumbs.length ? `<div class="film">${v.thumbs.slice(0, 3).map(t => `<img src="${t}">`).join("")}</div>` : `<img alt="">`;
      d.innerHTML = `
        <button class="t-del" title="移除">✕</button>
        ${film}
        <div class="t-name" title="${v.name}">🎥 ${v.name}</div>
        ${v.done ? `<div class="t-tag">运动 ${v.stats.motion.toFixed(1)} · 抽帧 ${v.thumbs.length}</div>` : `<div class="t-tag">⏳ 待本地解析</div>`}`;
      d.querySelector(".t-del").onclick = () => { state.videos.splice(state.videos.indexOf(v), 1); renderThumbs(); };
      vt.appendChild(d);
    }
  }

  // ---------- Step2 → Step3：本地媒体分析 ----------
  async function goStep3() {
    collectBasic();
    if (!state.people.some(p => p.year)) state.people = state.people.filter((p, i) => p.year || i === 0);
    showStep(3);
    const todos = [
      ...state.photos.filter(p => !p.done),
      ...state.videos.filter(v => !v.done)
    ];
    if (todos.length) {
      $("mediaProgress").classList.remove("hidden");
      const total = todos.length;
      let done = 0;
      for (const item of todos) {
        const isVideo = !!item.thumbs;
        $("mediaProgressText").textContent = `正在本地分析：${item.name}（${done + 1}/${total}）`;
        try {
          if (isVideo) {
            const r = await MediaAnalyzer.analyzeVideo(item.file, frac => {
              $("mediaProgressBar").style.width = `${((done + frac) / total) * 100}%`;
            });
            Object.assign(item, r, { done: true });
          } else {
            const r = await MediaAnalyzer.analyzePhoto(item.file);
            Object.assign(item, r, { done: true });
          }
        } catch (e) {
          item.done = true;
          toast(`${item.name} 分析失败：${e.message}`);
        }
        done++;
        $("mediaProgressBar").style.width = `${(done / total) * 100}%`;
      }
      $("mediaProgress").classList.add("hidden");
      renderThumbs();
    }
    mergeDerivedFindings();
    renderStats();
    renderFindTable();
  }

  // 将媒体量化结论并入发现清单（sci 类）
  function mergeDerivedFindings() {
    const bag = new Map();
    const collect = (item, srcKey) => {
      for (const d of item.derived || []) {
        const key = d.name;
        if (!bag.has(key)) bag.set(key, {
          name: d.name, cat: "科学维度", note: d.note, positive: !!d.positive, sci: true,
          risk: d.positive ? 0 : (d.risk ?? 1),
          resKey: null,
          sources: {
            text: { state: "absent", evidence: "" },
            photo: { state: "absent", evidence: "" },
            video: { state: "absent", evidence: "" }
          }
        });
        const f = bag.get(key);
        const src = f.sources[srcKey];
        if (src.state !== "yes") {
          src.state = "yes";
          src.evidence = d.note;
        }
      }
    };
    state.photos.forEach(p => collect(p, "photo"));
    state.videos.forEach(v => collect(v, "video"));
    for (const f of bag.values()) {
      const exist = state.findings.find(x => x.name === f.name && x.sci);
      if (exist) {
        for (const k of ["text", "photo", "video"]) {
          if (f.sources[k].state === "yes" && exist.sources[k].state !== "yes") {
            exist.sources[k] = f.sources[k];
          }
        }
      } else state.findings.push(f);
    }
  }

  function renderStats() {
    const box = $("mediaStats");
    box.innerHTML = "";
    for (const p of state.photos.filter(x => x.done)) {
      const s = p.stats;
      box.appendChild(statCard(`📷 ${p.name}`, [
        ["平均亮度", s.lum.toFixed(0) + "/255"], ["明暗对比", s.contrast.toFixed(0)],
        ["色调偏暖", s.warmth > 0 ? `+${s.warmth.toFixed(0)}` : s.warmth.toFixed(0)], ["边缘密度", s.edge.toFixed(1)]
      ], p.derived.map(d => `${d.name}（${d.note}）`)));
    }
    for (const v of state.videos.filter(x => x.done)) {
      const s = v.stats;
      box.appendChild(statCard(`🎥 ${v.name}`, [
        ["帧间运动强度", s.motion.toFixed(1)], ["平均亮度", s.lumAvg.toFixed(0) + "/255"],
        ["光影变化", s.lumVar.toFixed(1)], s.audio.usable ? ["音频响度", s.audio.db.toFixed(0) + " dBFS"] : ["音频", "无法解码"]
      ], v.derived.map(d => `${d.name}（${d.note}）`)));
    }
  }

  function statCard(title, kpis, notes) {
    const d = document.createElement("div");
    d.className = "stat-card";
    d.innerHTML = `<b>${title}</b>` + kpis.map(([k, v]) => `<span>${k}：<span class="kpi">${v}</span></span>`).join("　")
      + (notes.length ? `<div style="margin-top:5px;color:var(--sub)">${notes.join("；")}</div>` : "");
    return d;
  }

  // ---------- 确认表格 ----------
  const STATES = [["absent", "— 未涉及"], ["yes", "✅ 有证据"], ["no", "❌ 未见"], ["conflict", "⚠️ 矛盾"]];

  function renderFindTable() {
    const tb = $("findTable");
    tb.innerHTML = `<thead><tr>
      <th>发现</th><th>分类</th><th>风险</th>
      <th>文字</th><th>照片（确认）</th><th>视频（确认）</th><th></th></tr></thead>`;
    const body = document.createElement("tbody");
    state.findings.forEach((f, idx) => {
      const tr = document.createElement("tr");
      const cellSel = (k) => `
        <select data-f="${idx}" data-k="${k}">
          ${STATES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
        </select>
        <input class="ev" data-ev="${idx}:${k}" placeholder="说明（可选）" value="${(f.sources[k].evidence || "").replace(/"/g, "&quot;")}" style="margin-top:4px;${f.sources[k].state === "yes" ? "" : "display:none"}">`;
      tr.innerHTML = `
        <td><b>${f.name}</b>${f.sci ? '<div class="cat-chip">媒体量化</div>' : `<div class="cat-chip">"${f.saying || ""}"</div>`}</td>
        <td class="cat-chip">${f.cat}</td>
        <td><span class="badge r${f.risk}">${KB.riskMeta[f.risk].name}</span></td>
        <td>${cellSel("text")}</td>
        <td>${cellSel("photo")}</td>
        <td>${cellSel("video")}</td>
        <td><button class="btn small" data-del="${idx}">✕</button></td>`;
      body.appendChild(tr);
    });
    tb.appendChild(body);

    tb.querySelectorAll("select").forEach(sel => {
      sel.value = state.findings[+sel.dataset.f].sources[sel.dataset.k].state;
      sel.onchange = () => {
        const f = state.findings[+sel.dataset.f], k = sel.dataset.k;
        f.sources[k].state = sel.value;
        const ev = tb.querySelector(`input[data-ev="${sel.dataset.f}:${k}"]`);
        if (ev) ev.style.display = sel.value === "yes" ? "" : "none";
        if (sel.value === "no") f.sources[k].evidence = "";
      };
    });
    tb.querySelectorAll("input[data-ev]").forEach(inp => {
      inp.oninput = () => {
        const [fi, k] = inp.dataset.ev.split(":");
        state.findings[+fi].sources[k].evidence = inp.value;
      };
    });
    tb.querySelectorAll("button[data-del]").forEach(btn => {
      btn.onclick = () => { state.findings.splice(+btn.dataset.del, 1); renderFindTable(); };
    });

    // 手动补充下拉
    const addSel = $("addFindingSelect");
    addSel.innerHTML = '<option value="">选择要补充的发现…</option>';
    const seen = new Set();
    for (const t of KB.terms) {
      const name = t.term.split("/")[0].trim();
      const key = name + "|" + t.cat;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = document.createElement("option");
      o.value = key;
      o.textContent = `${name}（${t.cat}）`;
      addSel.appendChild(o);
    }
  }

  function addManualFinding() {
    const sel = $("addFindingSelect");
    if (!sel.value) { toast("请先选择要补充的发现"); return; }
    const [name, cat] = sel.value.split("|");
    const term = KB.terms.find(t => t.term.split("/")[0].trim() === name && t.cat === cat);
    if (state.findings.some(f => f.name === name && !f.sci)) { toast("该发现已存在"); return; }
    state.findings.push({
      name, cat, saying: term ? term.saying : "", note: term ? term.note : "",
      positive: false, sci: false, resKey: name,
      risk: KB.resolutions[name] ? KB.resolutions[name].risk : 1,
      sources: { text: { state: "absent", evidence: "" }, photo: { state: "absent", evidence: "" }, video: { state: "absent", evidence: "" } }
    });
    renderFindTable();
    toast(`已补充「${name}」，请在表格中勾选证据来源`);
  }

  // ---------- Step3 → Step4：生成报告 ----------
  function goStep4() {
    CrossValidator.evaluateAll(state.findings);
    const md = ReportGenerator.build({
      text: state.text, photos: state.photos, videos: state.videos,
      findings: state.findings, basic: state.basic, geo: state.geo,
      people: state.people.filter(p => p.year),
      autoHemisphere: state.autoHemisphere, autoFacing: state.autoFacing,
      metaRegion: state.metaRegion
    });
    state.reportMD = md;
    $("reportView").innerHTML = MDRenderer.render(md);
    const n = state.findings.filter(f => !f.judgement.excluded).length;
    $("reportHint").textContent = `共输出 ${n} 项有效结论（已按证据链矩阵判定置信度）`;
    showStep(4);
  }

  function downloadMD() {
    const now = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    const name = `风水环境分析报告-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.md`;
    const blob = new Blob([state.reportMD || ""], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("报告已下载：" + name);
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(state.reportMD || ""); toast("已复制到剪贴板"); }
    catch { toast("复制失败，请手动选择文本复制"); }
  }

  document.addEventListener("DOMContentLoaded", init);
  return { state };
})();
