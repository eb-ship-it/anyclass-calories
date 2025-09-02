// ====== НАСТРОЙКА ======
const WEBHOOK_URL = 'https://n8n-test.anysports.tv/webhook/analyze';

// ====== DOM ======
const fileInput = document.getElementById('file');
const pickBtn   = document.getElementById('pickBtn');
const preview   = document.getElementById('preview');
const btn       = document.getElementById('analyzeBtn');
const loading   = document.getElementById('loading');
const result    = document.getElementById('result');
const errorBox  = document.getElementById('error');

let selectedFile = null;

function showLoading(on) { loading.style.display = on ? 'inline-block' : 'none'; }
function setError(msg)   { errorBox.textContent = msg || ''; }
function setResult(html) { result.innerHTML = html || ''; }

// ---------- Открываем системный выбор/камеру ----------
pickBtn.addEventListener('click', () => {
  // каждый раз сбрасываем value, чтобы change сработал, даже если выбрали то же фото
  fileInput.value = '';

  // запрещаем HEIC/HEIF — часто не декодируется в браузере и ломает превью/сжатие
  fileInput.setAttribute('accept', 'image/jpeg,image/png,image/webp');

  // на Android подсказка открыть тыловую камеру
  if (/Android/i.test(navigator.userAgent)) {
    fileInput.setAttribute('capture', 'environment');
  } else {
    fileInput.removeAttribute('capture'); // iOS игнорирует capture, но пусть будет чисто
  }

  fileInput.click();
});

// ---------- Сжатие изображения перед отправкой ----------
async function downscaleImage(file, maxDim = 1280, quality = 0.85) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file;

    // если формат неожиданный — отдаём как есть
    const okTypes = ['image/jpeg','image/png','image/webp'];
    if (!okTypes.includes(file.type)) return file;

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });

    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width  = Math.round(width * scale);
    height = Math.round(height * scale);

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
    return file;
  }
}

// ---------- Превью выбранного файла ----------
fileInput.addEventListener('change', () => {
  setResult(''); setError('');
  const file = fileInput.files?.[0];
  selectedFile = file || null;

  if (!file) {
    preview.innerHTML = '<span class="muted">Здесь появится превью фото</span>';
    return;
  }

  // Инфо о файле (на случай если превью не отрисуется)
  const info = `<span class="muted">Файл: ${file.type || 'unknown'}, ${(file.size/1024|0)}KB</span>`;

  // Пробуем показать превью
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { preview.innerHTML = ''; preview.appendChild(img); };
  img.onerror = () => { preview.innerHTML = info; };
  img.src = url;
  img.alt = 'preview';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
});

// ---------- Обработчик клика "Рассчитать" ----------
btn.addEventListener('click', async () => {
  setError(''); setResult('');

  if (!selectedFile) {
    setError('Сначала выбери фото.');
    return;
  }

  // Сжимаем только поддерживаемые форматы; иначе — отправляем как есть
  const needsCompress = ['image/jpeg','image/png','image/webp'].includes(selectedFile.type);
  const fileToSend = needsCompress
    ? await downscaleImage(selectedFile, 1280, 0.85)
    : selectedFile;

  const fd = new FormData();
  // Поле должно называться 'image' — n8n положит его в binary.image0
  fd.append('image', fileToSend, 'photo.jpg');

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
