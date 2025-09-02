// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze'; // твой Production URL

// ====== DOM ======
const fileInput = document.getElementById('file');
const preview   = document.getElementById('preview');
const btn       = document.getElementById('analyzeBtn');
const loading   = document.getElementById('loading');
const result    = document.getElementById('result');
const errorBox  = document.getElementById('error');

let selectedFile = null;

// маленькие утилиты
function showLoading(on) { loading.style.display = on ? 'block' : 'none'; }
function setError(msg)   { errorBox.textContent = msg || ''; }
function setResult(html) { result.innerHTML = html || ''; }

// ====== Превью выбранного файла ======
fileInput.addEventListener('change', () => {
  setResult('');
  setError('');
  const file = fileInput.files?.[0];
  if (!file) {
    selectedFile = null;
    preview.innerHTML = '';
    return;
  }
  selectedFile = file;
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview" />`;
});

// ====== Обработка клика "Рассчитать" ======
btn.addEventListener('click', async () => {
  setError('');
  setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  // готовим форму
  const fd = new FormData();
  fd.append('image', selectedFile);

  // таймаут (на случай зависаний сети)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 сек

  btn.disabled = true;
  showLoading(true);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: fd,
      signal: controller.signal,
    });

    // если сервер вернул ошибку — покажем код и текст
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${txt || 'ошибка сервера'}`);
    }

    // пытаемся распарсить JSON
    let data = null;
    try {
      data = await res.json();
    } catch {
      const txt = await res.text().catch(() => '');
      throw new Error(`Ответ не JSON — ${txt.slice(0, 300)}`);
    }

    // ожидаем формат { items: [...], totals: {...} }
    const items = Array.isArray(data.items) ? data.items : [];
    const totals = data.totals || {};

    const lines = items.map(it =>
      `• ${it.name} (~ ${Math.round(it.mass_g || 0)} г) · ${Math.round(it.kcal || 0)} ккал`
    ).join('<br/>');

    setResult(`
      <h3>✅ Готово!</h3>
      <div class="list">${lines || 'Ничего не распознано'}</div>
      <div style="margin-top:8px;">
        <div><strong>Итого:</strong> ${Math.round(totals.kcal || 0)} ккал</div>
        <div>🥩 Белки: ${Number(totals.protein_g || 0)} г</div>
        <div>🥑 Жиры: ${Number(totals.fat_g || 0)} г</div>
        <div>🍞 Углеводы: ${Number(totals.carb_g || 0)} г</div>
      </div>
      <div class="row">
        <button class="btn" onclick="location.reload()">Загрузить ещё фото</button>
      </div>
    `);
  } catch (e) {
    // показываем понятное сообщение пользователю
    setError(`Ошибка: ${e.message}`);
    console.error('[analyze error]', e);
  } finally {
    clearTimeout(timeoutId);
    btn.disabled = false;
    showLoading(false);
  }
});
