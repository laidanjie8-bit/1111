const navBtns = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab');

const DEMO_USER = { username: 'admin', password: '123456' };
const LOGIN_KEY = 'rebar_ui_login_user';

const state = {
  taskId: '',
  projectName: '地铁 12 号线 A 标',
  componentName: '3#桥墩承台',
  records: [],
  anomalies: [],
  traces: [],
};

const loginOverlay = document.getElementById('loginOverlay');
const appSidebar = document.getElementById('appSidebar');
const appMain = document.getElementById('appMain');
const currentUser = document.getElementById('currentUser');

const taskBadge = document.getElementById('taskBadge');
const pipelineLog = document.getElementById('pipelineLog');
const stepEls = [...document.querySelectorAll('#steps li')];
const reconCanvas = document.getElementById('reconCanvas');
const segCanvas = document.getElementById('segCanvas');

const hiddenCanvas = document.createElement('canvas');
const hiddenCtx = hiddenCanvas.getContext('2d');
const reconCtx = reconCanvas.getContext('2d');
const segCtx = segCanvas.getContext('2d');

for (const btn of navBtns) {
  btn.addEventListener('click', () => {
    navBtns.forEach((b) => b.classList.remove('active'));
    tabs.forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
}

function showApp(username) {
  currentUser.textContent = `用户：${username}`;
  loginOverlay.classList.add('hidden');
  appSidebar.classList.remove('hidden');
  appMain.classList.remove('hidden');
}

function showLogin() {
  loginOverlay.classList.remove('hidden');
  appSidebar.classList.add('hidden');
  appMain.classList.add('hidden');
}

function initAuth() {
  const savedUser = localStorage.getItem(LOGIN_KEY);
  if (savedUser) {
    showApp(savedUser);
  } else {
    showLogin();
  }
}

function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  if (username === DEMO_USER.username && password === DEMO_USER.password) {
    localStorage.setItem(LOGIN_KEY, username);
    errEl.textContent = '';
    showApp(username);
    appendTrace(`用户 ${username} 登录系统`);
  } else {
    errEl.textContent = '用户名或密码错误，请重试。';
  }
}

function handleLogout() {
  const user = localStorage.getItem(LOGIN_KEY) || 'unknown';
  localStorage.removeItem(LOGIN_KEY);
  appendTrace(`用户 ${user} 退出系统`);
  showLogin();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function setStep(step, active = true) {
  stepEls.forEach((el, idx) => {
    el.classList.toggle('done', idx <= step);
    el.classList.toggle('active-step', active && idx === step);
  });
  document.getElementById('progressBar').style.width = `${(step / (stepEls.length - 1)) * 100}%`;
}

function drawCanvasPlaceholder(ctx, text) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#f7faff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = '#8fa7d0';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(1, 1, ctx.canvas.width - 2, ctx.canvas.height - 2);
  ctx.setLineDash([]);
  ctx.fillStyle = '#4f5f80';
  ctx.font = '15px sans-serif';
  ctx.fillText(text, 16, 30);
}

function setFileList(inputEl, listElId) {
  const files = [...inputEl.files];
  const listEl = document.getElementById(listElId);
  if (!files.length) {
    listEl.innerHTML = '<li>暂无</li>';
  } else {
    listEl.innerHTML = files.map((f) => `<li>${f.name}</li>`).join('');
  }
}

async function loadPrimaryImage() {
  const imageInput = document.getElementById('imageInput');
  const file = imageInput.files?.[0];
  if (!file) return null;
  return createImageBitmap(file);
}

function preprocessImage(bitmap) {
  const maxW = 520;
  const maxH = 260;
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height);
  const w = Math.max(1, Math.floor(bitmap.width * ratio));
  const h = Math.max(1, Math.floor(bitmap.height * ratio));

  hiddenCanvas.width = w;
  hiddenCanvas.height = h;
  hiddenCtx.drawImage(bitmap, 0, 0, w, h);

  const img = hiddenCtx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);

  for (let i = 0; i < gray.length; i += 1) {
    const base = i * 4;
    gray[i] = 0.299 * img.data[base] + 0.587 * img.data[base + 1] + 0.114 * img.data[base + 2];
  }

  return { w, h, gray };
}

function reconstructPointCloud({ w, h, gray }) {
  reconCanvas.width = w;
  reconCanvas.height = h;
  reconCtx.fillStyle = '#0f172a';
  reconCtx.fillRect(0, 0, w, h);

  let count = 0;
  for (let y = 2; y < h - 2; y += 3) {
    for (let x = 2; x < w - 2; x += 3) {
      const i = y * w + x;
      const gx = gray[i + 1] - gray[i - 1];
      const gy = gray[i + w] - gray[i - w];
      const depth = Math.min(1, Math.hypot(gx, gy) / 80);
      const px = x + (y - h / 2) * 0.08;
      const py = y - depth * 22;
      reconCtx.fillStyle = `rgba(30, 211, 255, ${(0.25 + depth * 0.7).toFixed(3)})`;
      reconCtx.fillRect(px, py, 2, 2);
      count += 1;
    }
  }

  reconCtx.fillStyle = 'rgba(255,255,255,0.9)';
  reconCtx.font = '13px sans-serif';
  reconCtx.fillText(`重建点数: ${count}`, 12, 18);
  return count;
}

function findRebarCenters({ w, h, gray }, threshold) {
  const darkness = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let score = 0;
    for (let y = 0; y < h; y += 1) {
      score += Math.max(0, threshold - gray[y * w + x]);
    }
    darkness[x] = score / h;
  }

  const smooth = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    let cnt = 0;
    for (let k = -3; k <= 3; k += 1) {
      const ix = x + k;
      if (ix >= 0 && ix < w) {
        sum += darkness[ix];
        cnt += 1;
      }
    }
    smooth[x] = sum / cnt;
  }

  const avg = smooth.reduce((a, b) => a + b, 0) / w;
  const peaks = [];
  const minGap = Math.max(6, Math.floor(w / 25));

  for (let x = 1; x < w - 1; x += 1) {
    const localMax = smooth[x] > smooth[x - 1] && smooth[x] > smooth[x + 1];
    if (localMax && smooth[x] > avg * 1.5) {
      if (!peaks.length || x - peaks[peaks.length - 1].x > minGap) {
        peaks.push({ x, power: smooth[x] });
      } else if (smooth[x] > peaks[peaks.length - 1].power) {
        peaks[peaks.length - 1] = { x, power: smooth[x] };
      }
    }
  }
  return peaks;
}

function renderSegmentation({ w, h, gray }, peaks, threshold) {
  segCanvas.width = w;
  segCanvas.height = h;
  const imgData = segCtx.createImageData(w, h);

  for (let i = 0; i < gray.length; i += 1) {
    const g = gray[i];
    const b = i * 4;
    imgData.data[b] = g;
    imgData.data[b + 1] = g;
    imgData.data[b + 2] = g;
    imgData.data[b + 3] = 255;
  }
  segCtx.putImageData(imgData, 0, 0);

  peaks.forEach((p, idx) => {
    segCtx.fillStyle = 'rgba(37, 99, 235, 0.18)';
    segCtx.fillRect(Math.max(0, p.x - 4), 0, 8, h);
    segCtx.strokeStyle = '#1d4ed8';
    segCtx.lineWidth = 2;
    segCtx.beginPath();
    segCtx.moveTo(p.x, 0);
    segCtx.lineTo(p.x, h);
    segCtx.stroke();
    segCtx.fillStyle = '#1d4ed8';
    segCtx.font = '12px sans-serif';
    segCtx.fillText(`RB${idx + 1}`, p.x + 4, 14 + (idx % 3) * 14);
  });

  const rows = peaks.map((p, idx) => {
    const confidence = Math.min(0.99, (0.55 + p.power / (threshold + 1))).toFixed(2);
    const rowState = Number(confidence) > 0.8 ? '有效' : '需复核';
    return `<tr><td>SEG-${idx + 1}</td><td>${p.x}</td><td>${confidence}</td><td>${rowState}</td></tr>`;
  });

  document.getElementById('segBody').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4">未识别到钢筋实例</td></tr>';
}

function generateSyntheticImageData() {
  const w = 520;
  const h = 260;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 210;
      for (const bx of [40, 90, 145, 205, 265, 325, 385, 450]) {
        if (x >= bx && x <= bx + 10 && y > 20 && y < h - 20) v = 30;
      }
      gray[y * w + x] = v;
    }
  }
  return { w, h, gray };
}

function calculateSpacing(peaks, mmPerPx, design, tolerance) {
  if (peaks.length < 2) return [];
  const sorted = [...peaks].sort((a, b) => a.x - b.x);
  const items = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const measured = Number(((sorted[i].x - sorted[i - 1].x) * mmPerPx).toFixed(1));
    const deviation = Number((measured - design).toFixed(1));
    const ok = Math.abs(deviation) <= tolerance;
    const taclsScore = Math.max(60, 100 - Math.abs(deviation) * 1.8).toFixed(1);
    items.push({ id: `RB-${i}`, measured, deviation, ok, taclsScore });
  }
  return items;
}

function renderResult(items, design, tolerance) {
  const body = document.getElementById('resultBody');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="6">钢筋数量不足，无法计算间距</td></tr>';
    document.getElementById('summary').textContent = '检测失败：请上传清晰钢筋图像（至少识别2根钢筋）。';
    return;
  }

  const okCount = items.filter((x) => x.ok).length;
  const total = items.length;
  const rate = ((okCount / total) * 100).toFixed(2);
  body.innerHTML = items.map((x) => `
    <tr><td>${x.id}</td><td>${design}</td><td>${x.measured}</td><td>${x.deviation}</td><td>${x.taclsScore}</td><td>${x.ok ? '<span class="tag ok">合规</span>' : '<span class="tag bad">不合规</span>'}</td></tr>
  `).join('');

  document.getElementById('summary').textContent = `总间距对数：${total} ｜ 合规：${okCount} ｜ 不合规：${total - okCount} ｜ 合规率：${rate}%（阈值 ±${tolerance}mm）`;

  const status = okCount === total ? '合规' : '异常';
  state.records.unshift({
    id: `R-${Date.now().toString().slice(-6)}`,
    project: state.projectName,
    component: state.componentName,
    time: new Date().toLocaleString(),
    summary: `${total}组间距，设计${design}mm，合规率${rate}%，状态：${status}`,
  });

  if (status === '异常') {
    const anomaly = { id: `A-${Date.now().toString().slice(-6)}`, taskId: state.taskId, type: '间距超限', desc: 'TBCC 判定发现间距超限组', status: 'OPEN', owner: '-', rootCause: '定位偏移或绑扎误差' };
    state.anomalies.unshift(anomaly);
    appendTrace(`${anomaly.id} 创建：${anomaly.desc}`);
  }

  renderRecords();
  renderAnomalies();
}

function appendTrace(text) {
  const time = new Date().toLocaleString();
  state.traces.unshift(`${time} - ${text}`);
  renderTraces();
}

function renderTraces() {
  const log = document.getElementById('traceLog');
  log.innerHTML = state.traces.length ? state.traces.map((t) => `<li>${t}</li>`).join('') : '<li>暂无操作记录</li>';
}

function renderRecords(rows = state.records) {
  const body = document.getElementById('recordBody');
  body.innerHTML = rows.map((r) => `
    <tr><td>${r.id}</td><td>${r.project}</td><td>${r.component}</td><td>${r.time}</td><td>${r.summary}</td><td><button data-op="detail" data-id="${r.id}">查看详情</button></td></tr>
  `).join('');

  body.querySelectorAll('button[data-op="detail"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = state.records.find((x) => x.id === btn.dataset.id);
      if (!record) return;
      document.getElementById('recordDetail').innerHTML = `<strong>${record.id}</strong><br/>项目：${record.project}<br/>构件：${record.component}<br/>时间：${record.time}<br/>结论：${record.summary}`;
    });
  });
}

function statusClass(status) {
  if (status === 'OPEN') return 'status-open';
  if (status === 'IN_PROGRESS') return 'status-progress';
  return 'status-closed';
}

function renderAnomalies() {
  const body = document.getElementById('anomalyBody');
  body.innerHTML = state.anomalies.map((a) => `
    <tr>
      <td>${a.id}</td><td>${a.taskId}</td><td>${a.type}</td><td>${a.desc}</td>
      <td><span class="${statusClass(a.status)}">${a.status}</span></td>
      <td>${a.owner}</td><td>${a.rootCause}</td>
      <td><button data-op="assign" data-id="${a.id}">指派</button><button data-op="close" data-id="${a.id}">关闭</button><button data-op="recheck" data-id="${a.id}">复检</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = state.anomalies.find((x) => x.id === btn.dataset.id);
      if (!a) return;
      if (btn.dataset.op === 'assign') { a.owner = 'qa_lead'; a.status = 'IN_PROGRESS'; appendTrace(`${a.id} 已指派给 qa_lead`); }
      if (btn.dataset.op === 'close') { a.status = 'CLOSED'; appendTrace(`${a.id} 已关闭并完成闭环`); }
      if (btn.dataset.op === 'recheck') appendTrace(`${a.id} 发起复检（TBCC二次判定）`);
      renderAnomalies();
    });
  });
}

function createTask() {
  state.taskId = `T-${Date.now()}`;
  state.projectName = document.getElementById('projectName').value.trim() || '未命名项目';
  state.componentName = document.getElementById('componentName').value.trim() || '未命名构件';
  taskBadge.textContent = `当前任务：${state.taskId}`;
  setStep(0);
  pipelineLog.textContent = '任务已创建，等待启动算法流程。';
  drawCanvasPlaceholder(reconCtx, '等待三维重建...');
  drawCanvasPlaceholder(segCtx, '等待实例分割...');
  document.getElementById('segBody').innerHTML = '<tr><td colspan="4">暂无分割结果</td></tr>';
  document.getElementById('summary').textContent = '暂无结果';
  document.getElementById('resultBody').innerHTML = '<tr><td colspan="6">暂无结果</td></tr>';
}

async function runPipeline() {
  if (!state.taskId) return alert('请先创建任务');

  const bitmap = await loadPrimaryImage();
  const threshold = Number(document.getElementById('segThreshold').value || 120);
  const design = Number(document.getElementById('designSpacing').value || 150);
  const tolerance = Number(document.getElementById('allowedDeviation').value || 10);
  const mmPerPx = Number(document.getElementById('scaleMmPerPx').value || 3.0);

  const imageData = bitmap ? preprocessImage(bitmap) : generateSyntheticImageData();

  setStep(1);
  pipelineLog.textContent = bitmap ? 'GeoMVSNet：根据输入图像生成点云重建...' : 'GeoMVSNet：未上传图像，使用内置样例进行重建...';
  await sleep(350);
  const pointCount = reconstructPointCloud(imageData);

  setStep(2);
  pipelineLog.textContent = 'Mask3D-rebar：提取钢筋实例并输出掩码...';
  await sleep(350);
  const peaks = findRebarCenters(imageData, threshold);
  renderSegmentation(imageData, peaks, threshold);

  setStep(3);
  pipelineLog.textContent = 'TACLS：根据实例中心计算钢筋间距...';
  await sleep(250);
  const spacingItems = calculateSpacing(peaks, mmPerPx, design, tolerance);

  setStep(4);
  pipelineLog.textContent = 'TBCC：执行合规判定并生成检测记录...';
  await sleep(250);
  renderResult(spacingItems, design, tolerance);

  pipelineLog.textContent = `流程完成：重建点数 ${pointCount}，识别实例 ${peaks.length}。`;
}

// events
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

document.getElementById('createTaskBtn').addEventListener('click', createTask);
document.getElementById('runBtn').addEventListener('click', runPipeline);
document.getElementById('imageInput').addEventListener('change', (e) => {
  setFileList(e.target, 'imageList');
  const first = e.target.files?.[0];
  if (first) appendTrace(`上传图像：${first.name}`);
});
document.getElementById('docInput').addEventListener('change', (e) => {
  setFileList(e.target, 'docList');
  const first = e.target.files?.[0];
  if (first) appendTrace(`上传文档：${first.name}`);
});

document.getElementById('searchRecord').addEventListener('click', () => {
  const projectKeyword = document.getElementById('projectFilter').value.trim();
  const statusKeyword = document.getElementById('statusFilter').value.trim();
  let rows = [...state.records];
  if (projectKeyword) rows = rows.filter((r) => r.project.includes(projectKeyword));
  if (statusKeyword) rows = rows.filter((r) => r.summary.includes(statusKeyword));
  renderRecords(rows);
});

document.getElementById('resetRecord').addEventListener('click', () => {
  document.getElementById('projectFilter').value = '';
  document.getElementById('statusFilter').value = '';
  renderRecords();
});

// initial
setStep(0, false);
renderRecords();
renderAnomalies();
renderTraces();
drawCanvasPlaceholder(reconCtx, '等待三维重建...');
drawCanvasPlaceholder(segCtx, '等待实例分割...');
initAuth();
