// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze'; // если адрес изменится — обнови здесь

// ====== DOM ======
const fileInput = document.getElementById('file');
const preview   = document.getElementById('preview');
const btn       = document.getElementById('analyzeBtn');
const loading   = document.getElementById('loading');
const result    = document.getElementById('result');
const errorBox  = document.getElementById('error');

let selectedFile = null;

function showLoading(on) { loading.style.display = on ? 'inline-block' : 'none'; }
function setError(msg)   { errorBox.textContent = msg || ''; }
function setResult(html) { result.innerHTML = html || ''; }

// Превью выбранного файла
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;
  if (!file) { preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>'; return; }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview"/>`;
});

// Основной клик
btn.addEventListener('click', async () => {
  setError(''); setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  const fd = new FormData();
  // Важно: поле должно называться 'image' — n8n положит его в binary.image0
  fd.append('image', selectedFile);

  btn.disabled = true;
  showLoading(true);

  // таймаут сети
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd, signal: controller.signal });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? ' — ' + txt : ''}`);
    }

    // ожидаем объект {items:[], totals:{}}
    let data = await res.json();
    // защита от неожиданной структуры
    if (Array.isArray(data)) data = data[0] || {};
    if (data && data.json && !data.items) data = data.json;

    renderResult(data);
  } catch (e) {
    setError(`Ошибка: ${e.message}`);
    console.error(e);
  } finally {
    clearTimeout(t);
    btn.disabled = false;
    showLoading(false);
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
// Сжимает изображение в браузере до maxDim по большей стороне
async function downscaleImage(file, maxDim = 1280, quality = 0.85) {
  if (!file || !file.type.startsWith('image/')) return file;

  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });

  const canvas = document.createElement('canvas');
  let { width, height } = img;

  // масштабируем по большей стороне
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise((res) => {
    canvas.toBlob(
      (blob) => res(blob || file),
      'image/jpeg',
      quality
    );
  });
}

// Сжимает изображение в браузере до maxDim по большей стороне
async function downscaleImage(file, maxDim = 1280, quality = 0.85) {
  if (!file || !file.type.startsWith('image/')) return file;

  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });

  const canvas = document.createElement('canvas');
  let { width, height } = img;

  // масштабируем по большей стороне
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise((res) => {
    canvas.toBlob(
      (blob) => res(blob || file),
      'image/jpeg',
      quality
    );
  });
}
