// 媒体分析引擎：照片量化分析（亮度/对比/色调/边缘）+ 视频抽帧/运动/音频响度
// 全部在浏览器本地完成，文件不离开设备
"use strict";

const MediaAnalyzer = (() => {
  // ---------- 工具 ----------
  function fileURL(file) { return URL.createObjectURL(file); }

  function drawScaled(source, sw, sh, maxW) {
    const scale = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(source, 0, 0, w, h);
    return cv;
  }

  function imageStats(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data;
    let sumL = 0, sumL2 = 0, sumR = 0, sumG = 0, sumB = 0, sumSat = 0, n = w * h;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = L; sumL += L; sumL2 += L * L;
      sumR += r; sumG += g; sumB += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumSat += mx === 0 ? 0 : (mx - mn) / mx;
    }
    const avgL = sumL / n;
    const stdL = Math.sqrt(Math.max(0, sumL2 / n - avgL * avgL));
    // 简化梯度（边缘密度）
    let edgeSum = 0, edgeN = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = Math.abs(gray[i - 1] - gray[i + 1]);
      const gy = Math.abs(gray[i - w] - gray[i + w]);
      edgeSum += gx + gy; edgeN++;
    }
    return {
      lum: avgL, contrast: stdL,
      warmth: (sumR - sumB) / n,
      sat: sumSat / n,
      edge: edgeN ? edgeSum / edgeN : 0
    };
  }

  // ---------- 照片 ----------
  function analyzePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = fileURL(file);
      const img = new Image();
      img.onload = () => {
        const cv = drawScaled(img, img.naturalWidth, img.naturalHeight, 512);
        const ctx = cv.getContext("2d");
        const st = imageStats(ctx, cv.width, cv.height);
        const thumb = makeThumb(img, 200);
        URL.revokeObjectURL(url);
        resolve({ file, name: file.name, thumb, stats: st, derived: photoDerived(st) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法解码图片: " + file.name)); };
      img.src = url;
    });
  }

  function makeThumb(img, size) {
    const cv = drawScaled(img, img.naturalWidth, img.naturalHeight, size);
    return cv.toDataURL("image/jpeg", 0.7);
  }

  function photoDerived(st) {
    const out = [];
    if (st.lum < 62) out.push({ name: "采光不足", note: `照片平均亮度 ${st.lum.toFixed(0)}/255，明显偏暗`, risk: 1 });
    else if (st.lum > 196 && st.contrast > 58) out.push({ name: "强光/眩光", note: `亮度 ${st.lum.toFixed(0)} 且反差 ${st.contrast.toFixed(0)} 偏高，注意反光干扰`, risk: 1 });
    else out.push({ name: "采光适中", note: `照片平均亮度 ${st.lum.toFixed(0)}/255，处于舒适区间`, risk: 0, positive: true });
    if (st.edge > 26) out.push({ name: "环境密度偏高", note: `画面边缘密度 ${st.edge.toFixed(1)}，视线内物体较多较杂`, risk: 1 });
    return out;
  }

  // ---------- 视频 ----------
  function analyzeVideo(file, onProgress) {
    return new Promise(async (resolve, reject) => {
      const url = fileURL(file);
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "auto";
      video.src = url;

      const fail = (e) => { URL.revokeObjectURL(url); reject(new Error("无法解码视频: " + file.name)); };
      video.onerror = fail;

      const frames = [], thumbs = [];
      try {
        await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; setTimeout(() => rej(new Error("timeout")), 15000); });
        const dur = finiteDuration(video);
        const N = Math.min(12, Math.max(6, Math.round(dur / 2)));
        let prevSmall = null, motionSum = 0, motionCnt = 0, lumList = [];

        for (let k = 0; k < N; k++) {
          const t = dur * (k + 0.5) / N;
          await seek(video, t);
          const cv = drawScaled(video, video.videoWidth, video.videoHeight, 480);
          const st = imageStats(cv.getContext("2d"), cv.width, cv.height);
          lumList.push(st.lum);
          thumbs.push(cv.toDataURL("image/jpeg", 0.55));
          // 64x48 小图用于运动估计
          const small = drawScaled(video, video.videoWidth, video.videoHeight, 64);
          const d = small.getContext("2d").getImageData(0, 0, small.width, small.height).data;
          if (prevSmall) {
            let diff = 0;
            for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - prevSmall[i]);
            motionSum += diff / (d.length / 4); motionCnt++;
          }
          prevSmall = d;
          if (onProgress) onProgress((k + 1) / N);
        }

        const audio = await audioStats(file);
        URL.revokeObjectURL(url);
        const motion = motionCnt ? motionSum / motionCnt : 0;
        const lumAvg = lumList.reduce((a, b) => a + b, 0) / lumList.length;
        const lumVar = Math.sqrt(lumList.reduce((a, b) => a + (b - lumAvg) ** 2, 0) / lumList.length);
        resolve({ file, name: file.name, thumbs, stats: { motion, lumAvg, lumVar, audio }, derived: videoDerived(motion, lumAvg, audio) });
      } catch (e) { fail(e); }
    });
  }

  function finiteDuration(video) {
    if (isFinite(video.duration) && video.duration > 0) return video.duration;
    // webm 无时长 hack
    video.currentTime = 1e7;
    return new Promise(res => video.onseeked = () => { const d = video.duration; video.currentTime = 0; res(isFinite(d) ? d : 10); });
  }

  function seek(video, t) {
    return new Promise((res, rej) => {
      video.onseeked = res; video.onerror = rej;
      video.currentTime = Math.min(t, (video.duration || t) - 0.05);
      setTimeout(() => res(), 3000);
    });
  }

  async function audioStats(file) {
    try {
      const buf = await file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const seg = Math.floor(audio.sampleRate * 0.5);
      const rmsList = [];
      for (let s = 0; s + seg < ch.length; s += seg) {
        let sum = 0;
        for (let i = s; i < s + seg; i += 8) sum += ch[i] * ch[i];
        rmsList.push(Math.sqrt(sum / (seg / 8)));
      }
      ctx.close();
      const rms = rmsList.length ? rmsList.reduce((a, b) => a + b, 0) / rmsList.length : 0;
      const peak = rmsList.length ? Math.max(...rmsList) : 0;
      const db = rms > 0 ? Math.max(0, 20 * Math.log10(rms)) : 0;
      return { usable: rmsList.length > 0, rms, peak, db };
    } catch (e) { return { usable: false, rms: 0, peak: 0, db: 0 }; }
  }

  function videoDerived(motion, lumAvg, audio) {
    const out = [];
    if (motion > 7) out.push({ name: "动态干扰明显", note: `帧间运动强度 ${motion.toFixed(1)}，画面内车流/人流等活动较多`, risk: 1 });
    else out.push({ name: "环境安静稳定", note: `帧间运动强度 ${motion.toFixed(1)}，画面动态较少`, risk: 0, positive: true });
    if (audio.usable) {
      if (audio.rms > 0.09) out.push({ name: "噪声偏高", note: `音频平均响度较高（RMS ${audio.rms.toFixed(3)}，约 ${audio.db.toFixed(0)} dBFS），可能有车流/施工声`, risk: 2 });
      else out.push({ name: "噪声水平较低", note: `音频响度正常（RMS ${audio.rms.toFixed(3)}）`, risk: 0, positive: true });
    }
    return out;
  }

  return { analyzePhoto, analyzeVideo };
})();
