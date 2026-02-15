const navBtns = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab');

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    navBtns.forEach((b) => b.classList.remove('active'));
    tabs.forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

const state = {
  taskId: '',
  records: [
    { id: 'R-9001', project: '地铁 12 号线 A 标', component: '3#桥墩承台', time: '2026-02-15 09:12', summary: '32根，合规率93.75%' },
    { id: 'R-9002', project: '滨江隧道改造', component: '底板B2区', time: '2026-02-15 10:18', summary: '18根，合规率100%' },
  ],
  anomalies: [
    { id: 'A-1001', taskId: 'T-00001', type: '间距超限', desc: '第4组钢筋偏差 +12mm', status: 'OPEN', owner: '-' },
    { id: 'A-1002', taskId: 'T-00002', type: '遮挡误分割', desc: 'Mask3D置信度低', status: 'IN_PROGRESS', owner: 'qa_lead' },
  ],
};

function renderRecords(rows = state.records) {
  const body = document.getElementById('recordBody');
  body.innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.project}</td><td>${r.component}</td><td>${r.time}</td><td>${r.summary}</td></tr>`).join('');
}

function statusClass(status) {
  if (status === 'OPEN') return 'tag-open';
  if (status === 'IN_PROGRESS') return 'tag-progress';
  return 'tag-closed';
}

function renderAnomalies() {
  const body = document.getElementById('anomalyBody');
  body.innerHTML = state.anomalies.map(a => `
    <tr>
      <td>${a.id}</td><td>${a.taskId}</td><td>${a.type}</td><td>${a.desc}</td>
      <td><span class="${statusClass(a.status)}">${a.status}</span></td>
      <td>${a.owner}</td>
      <td>
        <button data-op="assign" data-id="${a.id}">指派</button>
        <button data-op="close" data-id="${a.id}">关闭</button>
      </td>
    </tr>`).join('');

  body.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = state.anomalies.find(x => x.id === btn.dataset.id);
      if (!a) return;
      if (btn.dataset.op === 'assign') {
        a.owner = 'qa_lead';
        a.status = 'IN_PROGRESS';
      } else {
        a.status = 'CLOSED';
      }
      renderAnomalies();
    });
  });
}

function setStep(step) {
  const lis = [...document.querySelectorAll('#steps li')];
  lis.forEach((li, idx) => li.classList.toggle('done', idx <= step));
  document.getElementById('progressBar').style.width = `${(step / (lis.length - 1)) * 100}%`;
}

function generateResultRows() {
  const design = 150;
  const items = Array.from({ length: 8 }, (_, i) => {
    const measured = 144 + ((i * 4) % 14);
    const deviation = measured - design;
    const compliant = Math.abs(deviation) <= 10;
    return { id: `RB-${i + 1}`, design, measured, deviation, compliant };
  });

  const ok = items.filter(i => i.compliant).length;
  document.getElementById('summary').innerHTML = `总钢筋数: ${items.length} ｜ 合规: ${ok} ｜ 不合规: ${items.length - ok}`;
  document.getElementById('resultBody').innerHTML = items.map(i => `
    <tr>
      <td>${i.id}</td><td>${i.design}</td><td>${i.measured}</td><td>${i.deviation}</td>
      <td>${i.compliant ? '<span class="tag-ok">合规</span>' : '<span class="tag-bad">不合规</span>'}</td>
    </tr>
  `).join('');

  state.records.unshift({
    id: `R-${Date.now().toString().slice(-6)}`,
    project: '新建项目',
    component: '自动生成构件',
    time: new Date().toLocaleString(),
    summary: `8根，合规率${((ok / items.length) * 100).toFixed(2)}%`,
  });
  renderRecords();

  if (ok !== items.length) {
    state.anomalies.unshift({
      id: `A-${Date.now().toString().slice(-6)}`,
      taskId: state.taskId,
      type: '间距超限',
      desc: '自动检测到不合规数据',
      status: 'OPEN',
      owner: '-',
    });
    renderAnomalies();
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

document.getElementById('createTaskBtn').addEventListener('click', () => {
  state.taskId = `T-${Date.now()}`;
  document.getElementById('taskId').textContent = `当前任务：${state.taskId}`;
  setStep(0);
  document.getElementById('summary').textContent = '';
  document.getElementById('resultBody').innerHTML = '<tr><td colspan="5">暂无结果</td></tr>';
});

document.getElementById('runBtn').addEventListener('click', async () => {
  const imageCount = document.getElementById('imageInput').files.length;
  const docCount = document.getElementById('docInput').files.length;
  if (!state.taskId) return alert('请先创建任务');
  if (imageCount + docCount === 0) return alert('请至少上传图像或文档');

  for (let i = 1; i <= 4; i++) {
    setStep(i);
    await sleep(600);
  }
  generateResultRows();
  alert('流程完成：GeoMVSNet -> Mask3D-rebar -> TACLS -> TBCC');
});

document.getElementById('searchRecord').addEventListener('click', () => {
  const keyword = document.getElementById('projectFilter').value.trim();
  const rows = keyword ? state.records.filter((r) => r.project.includes(keyword)) : state.records;
  renderRecords(rows);
});

renderRecords();
renderAnomalies();
setStep(0);
