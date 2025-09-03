// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze';

// ====== DOM ======
const fileInput = document.getElementById('file');
const pickBtn   = document.getElementById('pickBtn');
const preview   = document.getElementById('preview');
const btn       = document.getElementById('analyzeBtn');
const loadingEl = document.getElementById('loading');
const loadingTextEl = document.getElementById('loadingText');
const result    = document.getElementById('result');
const errorBox  = document.getElementById('error');

// Статистика
const statsCard = document.getElementById('statsCard');
const sKcal = document.getElementById('sKcal');
const sP = document.getElementById('sP');
const sF = document.getElementById('sF');
const sC = document.getElementById('sC');
const sCount = document.getElementById('sCount');
const resetStatsBtn = document.getElementById('resetStats');

let selectedFile = null;

// ---------- Живой индикатор загрузки ----------
const LOADING_MESSAGES = [
  '🧠 Думаю…',
  '🔎 Ищу продукты на фото',
  '☺️ В AnyClass крутые разработчики',
  '🥣 Анализирую тарелку',
  '📚 Сверяю с базой нутриентов',
  '⚖️ Считаю калории и БЖУ',
  '🧪 Проверяю точность',
  '✨ Почти готово…'
];
let loadingTimer = null;
let loadingIndex = 0;

function startLoading() {
  loadingIndex = 0;
  loadingTextEl.textContent = LOADING_MESSAGES[0];
  loadingEl.style.display = 'inline-flex';
  loadingEl.setAttribute('aria-busy', 'true');

  loadingTimer = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % LOADING_MESSAGES.length;
    loadingTextEl.textContent = LOADING_MESSAGES[loadingIndex];
  }, 1200);
}

function stopLoading() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  loadingEl.style.display = 'none';
  loadingEl.setAttribute('aria-busy', 'false');
}

function setError(msg)   { errorBox.textContent = msg || ''; }
function setResult(html) { result.innerHTML = html || ''; }

// ---------- Вспомогательные для статистики ----------
const STATS_KEY_PREFIX = 'stats:';
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${STATS_KEY_PREFIX}${y}-${m}-${day}`;
}
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(todayKey())) || { kcal:0, protein_g:0, fat_g:0, carb_g:0, count:0 };
  } catch {
    return { kcal:0, protein_g:0, fat_g:0, carb_g:0, count:0 };
  }
}
function renderStats() {
  const s = loadStats();
  if (!statsCard) return;
  statsCard.style.display = s.count > 0 ? 'block' : 'none';
  sKcal.textContent = Math.round(s.kcal);
  sP.textContent = Math.round(s.protein_g);
  sF.textContent = Math.round(s.fat_g);
  sC.textContent = Math.round(s.carb_g);
  sCount.textContent = s.count;
}
function saveStats(totals) {
  const s = loadStats();
  s.kcal = (s.kcal || 0) + Number(totals.kcal || 0);
  s.protein_g = (s.protein_g || 0) + Number(totals.protein_g || 0);
  s.fat_g = (s.fat_g || 0) + Number(totals.fat_g || 0);
  s.carb_g = (s.carb_g || 0) + Number(totals.carb_g || 0);
  s.count = (s.count || 0) + 1;
  localStorage.setItem(todayKey(), JSON.stringify(s));
  renderStats();
}

// Сброс статистики
resetStatsBtn.addEventListener('click', () => {
  localStorage.removeItem(todayKey());
  renderStats();
});
document.addEventListener('DOMContentLoaded', renderStats);

// ---------- Выбор/камера ----------
pickBtn.addEventListener('click', () => {
  fileInput.value = '';
  if (/Android/i.test(navigator.userAgent)) {
    fileInput.setAttribute('capture', 'environment');
  } else {
    fileInput.removeAttribute('capture');
  }
  fileInput.setAttribute('accept', 'image/*');
  fileInput.click();
});

// ---------- Превью ----------
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;

  if (!file) {
    preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview" style="width:100%;height:100%;object-fit:cover;"/>`;
});

// ---------- Отправка на n8n ----------
btn.addEventListener('click', async () => {
  setError(''); setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  const fd = new FormData();
  // Важно: имя поля 'image' — n8n положит файл в binary.image0
  fd.append('image', selectedFile);

  btn.disabled = true;
  startLoading();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd, signal: controller.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? ' — ' + txt : ''}`);
    }

    let data = await res.json();
    if (Array.isArray(data)) data = data[0] || {};
    if (data && data.json && !data.items) data = data.json;

    renderResult(data);
  } catch (e) {
    setError(`Ошибка: ${e.message}`);
    console.error(e);
  } finally {
    clearTimeout(t);
    btn.disabled = false;
    stopLoading();
  }
});

function renderResult(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const totals = data.totals || {};

  if (!items.length) {
    setResult(`
      <h3>✅ Готово!</h3>
      <div class="muted">Ничего не распознано</div>
      <div style="margin-top:10px;">
        <div><strong>Итого:</strong> 0 ккал</div>
        <div>🍓 Белки: 0 г</div>
        <div>🥑 Жиры: 0 г</div>
        <div>🍞 Углеводы: 0 г</div>
      </div>
    `);
    return;
  }

  const lines = items.map(it => {
    const name = it.name ?? 'продукт';
    const mass = Math.round(Number(it.mass_g ?? 0));
    const kcal = Math.round(Number(it.kcal ?? 0));
    return `• ${name} (~ ${mass} г) · ${kcal} ккал`;
  }).join('<br/>');

  const kcal = Math.round(Number(totals.kcal ?? 0));
  const p = Number(totals.protein_g ?? 0);
  const f = Number(totals.fat_g ?? 0);
  const c = Number(totals.carb_g ?? 0);

  // Сохраняем в статистику за сегодня
  saveStats({ kcal, protein_g: p, fat_g: f, carb_g: c });

  setResult(`
    <h3>✅ Готово!</h3>
    <div class="list">${lines}</div>
    <div style="margin-top:14px;">
      <div><strong>Итого:</strong> ${kcal} ккал</div>
      <div>🍓 Белки: ${p}</div>
      <div>🥑 Жиры: ${f}</div>
      <div>🍞 Углеводы: ${c}</div>
    </div>
  `);
}
// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze';

// ====== DOM ======
const fileInput = document.getElementById('file');
const pickBtn   = document.getElementById('pickBtn');
const preview   = document.getElementById('preview');
const btn       = document.getElementById('analyzeBtn');
const loadingEl = document.getElementById('loading');
const loadingTextEl = document.getElementById('loadingText');
const result    = document.getElementById('result');
const errorBox  = document.getElementById('error');

// Статистика
const statsCard = document.getElementById('statsCard');
const sKcal = document.getElementById('sKcal');
const sP = document.getElementById('sP');
const sF = document.getElementById('sF');
const sC = document.getElementById('sC');
const sCount = document.getElementById('sCount');
const resetStatsBtn = document.getElementById('resetStats');

let selectedFile = null;

// ---------- Живой индикатор загрузки ----------
const LOADING_MESSAGES = [
  '🧠 Думаю…',
  '🔎 Ищу продукты на фото',
  '🥣 Анализирую тарелку',
  '📚 Сверяю с базой нутриентов',
  '⚖️ Считаю калории и БЖУ',
  '🧪 Проверяю точность',
  '✨ Почти готово…'
];
let loadingTimer = null;
let loadingIndex = 0;

function startLoading() {
  loadingIndex = 0;
  loadingTextEl.textContent = LOADING_MESSAGES[0];
  loadingEl.style.display = 'inline-flex';
  loadingEl.setAttribute('aria-busy', 'true');

  loadingTimer = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % LOADING_MESSAGES.length;
    loadingTextEl.textContent = LOADING_MESSAGES[loadingIndex];
  }, 1200);
}

function stopLoading() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  loadingEl.style.display = 'none';
  loadingEl.setAttribute('aria-busy', 'false');
}

function setError(msg)   { errorBox.textContent = msg || ''; }
function setResult(html) { result.innerHTML = html || ''; }

// ---------- Вспомогательные для статистики ----------
const STATS_KEY_PREFIX = 'stats:';
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${STATS_KEY_PREFIX}${y}-${m}-${day}`;
}
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(todayKey())) || { kcal:0, protein_g:0, fat_g:0, carb_g:0, count:0 };
  } catch {
    return { kcal:0, protein_g:0, fat_g:0, carb_g:0, count:0 };
  }
}
function renderStats() {
  const s = loadStats();
  if (!statsCard) return;
  statsCard.style.display = s.count > 0 ? 'block' : 'none';
  sKcal.textContent = Math.round(s.kcal);
  sP.textContent = Math.round(s.protein_g);
  sF.textContent = Math.round(s.fat_g);
  sC.textContent = Math.round(s.carb_g);
  sCount.textContent = s.count;
}
function saveStats(totals) {
  const s = loadStats();
  s.kcal = (s.kcal || 0) + Number(totals.kcal || 0);
  s.protein_g = (s.protein_g || 0) + Number(totals.protein_g || 0);
  s.fat_g = (s.fat_g || 0) + Number(totals.fat_g || 0);
  s.carb_g = (s.carb_g || 0) + Number(totals.carb_g || 0);
  s.count = (s.count || 0) + 1;
  localStorage.setItem(todayKey(), JSON.stringify(s));
  renderStats();
}

// Сброс статистики
resetStatsBtn.addEventListener('click', () => {
  localStorage.removeItem(todayKey());
  renderStats();
});
document.addEventListener('DOMContentLoaded', renderStats);

// ---------- Выбор/камера ----------
pickBtn.addEventListener('click', () => {
  fileInput.value = '';
  if (/Android/i.test(navigator.userAgent)) {
    fileInput.setAttribute('capture', 'environment');
  } else {
    fileInput.removeAttribute('capture');
  }
  fileInput.setAttribute('accept', 'image/*');
  fileInput.click();
});

// ---------- Превью ----------
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;

  if (!file) {
    preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview" style="width:100%;height:100%;object-fit:cover;"/>`;
});

// ---------- Отправка на n8n ----------
btn.addEventListener('click', async () => {
  setError(''); setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  const fd = new FormData();
  // Важно: имя поля 'image' — n8n положит файл в binary.image0
  fd.append('image', selectedFile);

  btn.disabled = true;
  startLoading();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd, signal: controller.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? ' — ' + txt : ''}`);
    }

    let data = await res.json();
    if (Array.isArray(data)) data = data[0] || {};
    if (data && data.json && !data.items) data = data.json;

    renderResult(data);
  } catch (e) {
    setError(`Ошибка: ${e.message}`);
    console.error(e);
  } finally {
    clearTimeout(t);
    btn.disabled = false;
    stopLoading();
  }
});

function renderResult(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const totals = data.totals || {};

  if (!items.length) {
    setResult(`
      <h3>✅ Готово!</h3>
      <div class="muted">Ничего не распознано</div>
      <div style="margin-top:10px;">
        <div><strong>Итого:</strong> 0 ккал</div>
        <div>🍓 Белки: 0 г</div>
        <div>🥑 Жиры: 0 г</div>
        <div>🍞 Углеводы: 0 г</div>
      </div>
    `);
    return;
  }

  const lines = items.map(it => {
    const name = it.name ?? 'продукт';
    const mass = Math.round(Number(it.mass_g ?? 0));
    const kcal = Math.round(Number(it.kcal ?? 0));
    return `• ${name} (~ ${mass} г) · ${kcal} ккал`;
  }).join('<br/>');

  const kcal = Math.round(Number(totals.kcal ?? 0));
  const p = Number(totals.protein_g ?? 0);
  const f = Number(totals.fat_g ?? 0);
  const c = Number(totals.carb_g ?? 0);

  // Сохраняем в статистику за сегодня
  saveStats({ kcal, protein_g: p, fat_g: f, carb_g: c });

  setResult(`
    <h3>✅ Готово!</h3>
    <div class="list">${lines}</div>
    <div style="margin-top:14px;">
      <div><strong>Итого:</strong> ${kcal} ккал</div>
      <div>🍓 Белки: ${p}</div>
      <div>🥑 Жиры: ${f}</div>
      <div>🍞 Углеводы: ${c}</div>
    </div>
  `);
}

<!-- В самом конце index.html -->
<script src="/script.js?v=3"></script> <!-- поменяй 3 на любое новое число при следующем апдейте -->

