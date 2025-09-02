// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze';

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

// -------- Сжатие изображения перед отправкой --------
// Уменьшаем картинку до maxDim по большей стороне и сохраняем в JPEG
async function downscaleImage(file, maxDim = 1280, quality = 0.85) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file;

    // Загружаем картинку в объект Image
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });

    // Вычисляем новые размеры
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width  = Math.round(width * scale);
    height = Math.round(height * scale);

    // Рисуем в canvas и экспортируем в JPEG
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        quality
      );
    });
  } catch {
    // На случай ошибки просто вернём исходник
    return file;
  }
}

// -------- Превью выбранного файла --------
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;
  if (!file) { 
    preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>'; 
    return; 
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="preview"/>`;
});

// -------- ОБРАБОТЧИК клика по кнопке "Рассчитать" --------
btn.addEventListener('click', async () => {
  setError(''); setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  // ВАЖНО: здесь мы сжимаем фото перед отправкой
  const compressed = await downscaleImage(selectedFile, 1280, 0.85);

  const fd = new FormData();
  // Имя поля должно быть 'image' — n8n положит его в binary.image0
  fd.append('image', compressed, 'photo.jpg');

  btn.disabled = true;
  showLoading(true);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd, signal: controller.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? ' — ' + txt : ''}`);
    }

    let data = await res.json();

    // Подстраховки под разные структуры ответа
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
