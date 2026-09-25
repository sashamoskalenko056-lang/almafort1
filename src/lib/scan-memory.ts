// Память ИИ-сканера на стороне посетителя: последние снимки и подтверждённые артикулы.
// Хранится в браузере (localStorage), на сервер уходит только текст признаков.
export type ScanMemoryEntry = {
  id: string;
  /** Миниатюра 96×96 JPEG — чтобы показать «ваши фото» без повторной загрузки. */
  thumb: string;
  sku: string | null;
  name: string | null;
  features: string;
  confirmed: boolean;
  at: number;
};

const KEY = "almafort-scan-memory";
const MAX = 12;

export function loadScanMemory(): ScanMemoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as ScanMemoryEntry[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveScanMemory(list: ScanMemoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* переполнено хранилище — память просто не сохранится */
  }
}

export async function makeThumb(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    96,
    96,
  );
  return c.toDataURL("image/jpeg", 0.7);
}

/** Подтверждённые записи для подсказки модели (только текст). */
export function memoryForPrompt(list: ScanMemoryEntry[]) {
  return list
    .filter((e) => e.confirmed && e.sku && e.features)
    .slice(0, 8)
    .map((e) => ({ sku: e.sku!, features: e.features.slice(0, 200) }));
}
