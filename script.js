// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze';

// ====== DOM ======
const fileInput = document.getElementById('file');
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

// ---------- Живой индикатор (ровно те фразы, что дала) ----------
const LOADING_MESSAGES = [
  "🧠 Думаю и анализирую…",
  "🔎 Ищу продукты на фото",
  "🚀 В AnyClass крутые разработчики",
  "🥣 Анализирую тарелку",
  "📚 Сверяю с базой нутриентов",
  "🎓 Ещё в AnyClass крутые курсы",
  "⚖️ Считаю калории и БЖУ",
  "🧪 Проверяю точность",
  "🧘 Лёгкая йога ждёт тебя",
  "✨ Почти готово — магия",
  "👋 Анастасия Бурдюг передаёт привет"
];
const LOADING_INTERVAL = 1200; // мс между фразами

let loadingTimer = null;
let loadingIndex = 0;

function startLoading() {
  if (!loadingEl) return;
  loadingIndex = 0;
  loadingTextEl.textContent = LOADING_MESSAGES[0];
  loadingEl.style.display = 'inline-flex';
  loadingTimer = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % LOADING_MESSAGES.length;
    loadingTextEl.textContent = LOADING_MESSAGES[loadingIndex];
  }, LOADING_INTERVAL);
}
function stopLoading() {
  if (loadingTimer) clearInterval(loadingTimer);
  loadingEl.style.display = 'none';
}

// ---------- Утилиты ----------
function setError(msg){ errorBox.textContent = msg || ''; }
function setResult(html){ result.innerHTML = html || ''; }
function round(n){ return Math.round(Number(n||0)); }

// ---------- Локальная статистика ----------
const STATS_KEY_PREFIX = 'stats:';
function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${STATS_KEY_PREFIX}${y}-${m}-${day}`;
}
function loadStats(){
  try { return JSON.parse(localStorage.getItem(todayKey())) || {kcal:0,protein_g:0,fat_g:0,carb_g:0,count:0}; }
  catch { return {kcal:0,protein_g:0,fat_g:0,carb_g:0,count:0}; }
}
function renderStats(){
  const s = loadStats();
  statsCard.style.display = s.count>0 ? 'block' : 'none';
  sKcal.textContent = round(s.kcal);
  sP.textContent = round(s.protein_g);
  sF.textContent = round(s.fat_g);
  sC.textContent = round(s.carb_g);
  sCount.textContent = s.count;
}
function saveStats(totals){
  const s = loadStats();
  s.kcal      += Number(totals.kcal||0);
  s.protein_g += Number(totals.protein_g||0);
  s.fat_g     += Number(totals.fat_g||0);
  s.carb_g    += Number(totals.carb_g||0);
  s.count     += 1;
  localStorage.setItem(todayKey(), JSON.stringify(s));
  renderStats();
}
resetStatsBtn?.addEventListener('click', () => {
  localStorage.removeItem(todayKey());
  renderStats();
});

// ---------- Превью файла ----------
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;
  if (!file){
    preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview">`;
});

// ---------- Анализ (останавливаем сразу после ответа) ----------
btn.addEventListener('click', async () => {
  setError(''); setResult('');
  if (!selectedFile){
    setError('Сначала выбери фото.');
    return;
  }

  const fd = new FormData();
  fd.append('image', selectedFile);

  btn.disabled = true;
  startLoading();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WEBHOOK_URL, { method:'POST', body:fd, signal:controller.signal });
    if (!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status}${txt ? ' — ' + txt : ''}`);
    }
    let data = await res.json();
    if (Array.isArray(data)) data = data[0] || {};
    if (data && data.json && !data.items) data = data.json;

    stopLoading();         // << сразу скрываем индикатор
    btn.disabled = false;

    renderResult(data);
  } catch (e){
    stopLoading();         // << тоже сразу скрываем при ошибке
    btn.disabled = false;
    console.error(e);
    setError(`Ошибка: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
});

// ---------- Рендер результата (карточки) ----------
function renderResult(data){
  const items = Array.isArray(data.items)? data.items : [];
  const totals = data.totals || {};
  const kcal = round(totals.kcal);
  const p = Number(totals.protein_g||0);
  const f = Number(totals.fat_g||0);
  const c = Number(totals.carb_g||0);
  const sumMacros = Math.max(1, p+f+c);
  const pctP = Math.round(p/sumMacros*100);
  const pctF = Math.round(f/sumMacros*100);
  const pctC = Math.round(c/sumMacros*100);

  if (!items.length){
    setResult(`
      <div class="totals-card">
        <div class="kcal-big">0 <small>ккал</small></div>
        <div class="muted" style="margin-top:6px;">Ничего не распознано</div>
      </div>
    `);
    return;
  }

  // карточка totals
  const totalsHTML = `
    <div class="totals-card">
      <div class="kcal-big">${kcal} <small>ккал</small></div>
      <div class="bars">
        <div class="bar protein" style="--val:${pctP}%"><span></span></div>
        <div class="bar-label">Белки: ${p.toFixed(1)} г</div>
        <div class="bar fat" style="--val:${pctF}%"><span></span></div>
        <div class="bar-label">Жиры: ${f.toFixed(1)} г</div>
        <div class="bar carb" style="--val:${pctC}%"><span></span></div>
        <div class="bar-label">Углеводы: ${c.toFixed(1)} г</div>
      </div>
    </div>
  `;

  // карточки по каждому продукту
  const itemCards = items.map((it) => {
    const name = it.name ?? 'продукт';
    const mass = round(it.mass_g);
    const kcalItem = round(it.kcal);
    const ip = Number(it.protein_g||0).toFixed(1);
    const iff = Number(it.fat_g||0).toFixed(1);
    const ic = Number(it.carb_g||0).toFixed(1);

    return `
      <div class="item-card">
        <div class="item-head">
          <div class="item-name">${escapeHtml(name)}</div>
          <div class="kcal-badge">${kcalItem} ккал</div>
        </div>
        <div class="chips">
          <span class="chip">~ ${mass} г</span>
          <span class="chip">Б ${ip}</span>
          <span class="chip">Ж ${iff}</span>
          <span class="chip">У ${ic}</span>
        </div>
      </div>
    `;
  }).join('');

  setResult(`
    ${totalsHTML}
    <div class="items-grid">${itemCards}</div>
  `);

  // обновим дневную статистику
  saveStats({kcal, protein_g:p, fat_g:f, carb_g:c});
}

// простейший эскейп
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]
  ));
}

// стартовая отрисовка
document.addEventListener('DOMContentLoaded', () => {
  stopLoading();
  renderStats();
});
