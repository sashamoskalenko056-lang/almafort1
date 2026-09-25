// Единый источник правды по цветовым вариациям каталога ALMAFORT.
// Изоморфный модуль без зависимостей от three.js/React: используется
// и в браузере (таблица, карточка, корзина), и на сервере (парсер смет).

export type Swatch = {
  hex: string;
  label: string;
  opacity?: number;
  roughness?: number;
  borderColor?: string;
};

/** Цвет позиции в корзине/счёте. Структура едина для 100 % SKU. */
export type ColorRef = { label: string; hex: string };

/** Дефолт для позиций без материальных вариаций (услуги и т. п.). */
export const DEFAULT_COLOR: ColorRef = { label: "Базовый", hex: "transparent" };

export const DOVETAIL_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#3e2723", label: "Тёмно-коричневый / Венге" },
  { hex: "#6a3326", label: "Красно-коричневый / Махагон" },
  { hex: "#8d6e63", label: "Светло-коричневый / Орех" },
  { hex: "#d7ccc8", label: "Бежевый / Слоновая кость" },
  { hex: "#757575", label: "Серый" },
  { hex: "#f5f5f5", label: "Полупрозрачный / Натуральный полимер", opacity: 0.8 },
];

export const DOVETAIL_CAP_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#3e2723", label: "Тёмно-коричневый" },
  { hex: "#6a3326", label: "Красно-коричневый / Махагон" },
  { hex: "#d7ccc8", label: "Бежевый / Песочный" },
  { hex: "#757575", label: "Серый" },
  { hex: "#f5f5f5", label: "Полупрозрачный / Натуральный", opacity: 0.8 },
];

export const LATHOLDER_PALETTE: Swatch[] = [{ hex: "#000000", label: "Чёрный (Базовый)" }];

export const GLASSHOLDER_PALETTE: Swatch[] = [
  { hex: "#1c3aa9", label: "Синий" },
  { hex: "#4ebaaa", label: "Мятный / Бирюзовый" },
  { hex: "#ffffff", label: "Белый" },
  { hex: "#dcb98a", label: "Бежевый" },
  { hex: "#8c9091", label: "Серый" },
  { hex: "#382a24", label: "Тёмно-коричневый" },
  { hex: "#f0f0f0", label: "Полупрозрачный / Матовый", opacity: 0.6, roughness: 0.2 },
];

export const ANGLE_BRACKET_PALETTE: Swatch[] = [
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#e8d5c4", label: "Бежевый" },
  { hex: "#d4a373", label: "Бук" },
  { hex: "#5d4037", label: "Коричневый" },
  { hex: "#8d6e63", label: "Орех светлый" },
  { hex: "#3e2723", label: "Орех тёмный" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#1976d2", label: "Синий" },
  { hex: "#388e3c", label: "Зелёный" },
  { hex: "#722f37", label: "Вишня" },
];

export const SHELF_GLASSHOLDER_PALETTE: Swatch[] = [
  { hex: "#8c9091", label: "Серый (базовый)" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
];

export const RODHOLDER_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#808080", label: "Серый" },
  { hex: "#3e2723", label: "Тёмно-коричневый / Венге" },
  { hex: "#722f37", label: "Красно-коричневый / Вишня" },
  { hex: "#d4a373", label: "Светло-коричневый / Бук" },
  { hex: "#e8d5c4", label: "Бежевый / Песочный" },
];

export const EUROVINT_CAP_PALETTE: Swatch[] = [
  { hex: "#fdd835", label: "Жёлтый" },
  { hex: "#1e88e5", label: "Голубой" },
  { hex: "#722f37", label: "Вишня" },
  { hex: "#3e2723", label: "Венге" },
  { hex: "#d4a373", label: "Бук" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#e8d5c4", label: "Бежевый" },
  { hex: "#e1c699", label: "Бамбук" },
];

export const SCREW_CAP_PALETTE: Swatch[] = [
  { hex: "#a05a45", label: "Светло-коричневый / Медный" },
  { hex: "#4a2c11", label: "Тёмно-коричневый" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#808080", label: "Серый" },
  { hex: "#e8d5c4", label: "Бежевый" },
];

export const ECCENTRIC_CAP_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#382a24", label: "Тёмно-коричневый / Венге" },
  { hex: "#722f37", label: "Красно-коричневый / Вишня" },
  { hex: "#dcb98a", label: "Светло-бежевый / Песочный" },
  { hex: "#1976d2", label: "Синий" },
];

export const KREPSS_PALETTE: Swatch[] = [{ hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" }];

export const SUPPORT_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#4a2c11", label: "Коричневый" },
];

export const METAL_FRAME_SUPPORT_PALETTE: Swatch[] = [{ hex: "#000000", label: "Чёрный" }];

export const TUBE_PLUG_PALETTE: Swatch[] = [{ hex: "#000000", label: "Чёрный (Базовый)" }];

export const BLACK_PALETTE: Swatch[] = [{ hex: "#000000", label: "Чёрный" }];

/** Автокомпоненты: базовый чёрный + технический серый. */
export const TOWBAR_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный (Базовый)" },
  { hex: "#6b7280", label: "Серый" },
];


/** SKU → палитра. Данные, а не хардкод в компонентах. */
export const SKU_PALETTES: Record<string, Swatch[]> = {
  "KAN-CAP-R": BLACK_PALETTE,
  "TG-080": BLACK_PALETTE,
  "TG-100": BLACK_PALETTE,
  "TG-150": BLACK_PALETTE,
  "MK-LH": DOVETAIL_PALETTE,
  "MK-LHZ": DOVETAIL_CAP_PALETTE,
  "MK-LD": LATHOLDER_PALETTE,
  "MK-SD": GLASSHOLDER_PALETTE,
  "MK-UG": ANGLE_BRACKET_PALETTE,
  "STK-POL-01": SHELF_GLASSHOLDER_PALETTE,
  "MK-SHD": RODHOLDER_PALETTE,
  "ZGD-EV": EUROVINT_CAP_PALETTE,
  "ZGD-SM": SCREW_CAP_PALETTE,
  "ZGD-EX": ECCENTRIC_CAP_PALETTE,
  "OP-H15": SUPPORT_PALETTE,
  "OP-H20": SUPPORT_PALETTE,
  "OP-H35": SUPPORT_PALETTE,
  "OP-H50": SUPPORT_PALETTE,
  "OP-SH-H50": SUPPORT_PALETTE,
  "OP-M6-H28": SUPPORT_PALETTE,
  "OP-PM-20": METAL_FRAME_SUPPORT_PALETTE,
  "OP-PM-25": METAL_FRAME_SUPPORT_PALETTE,
  "OP-P-STD": METAL_FRAME_SUPPORT_PALETTE,
  "ZGV-40x20": TUBE_PLUG_PALETTE,
  "ZGV-60x40": TUBE_PLUG_PALETTE,
  "ZGV-15x15": TUBE_PLUG_PALETTE,
  "ZGV-20x20": TUBE_PLUG_PALETTE,
  "ZGV-25x25": TUBE_PLUG_PALETTE,
  "ZGV-40x40": TUBE_PLUG_PALETTE,
  "ZGV-60x60": TUBE_PLUG_PALETTE,
  "ZGV-80x80": TUBE_PLUG_PALETTE,
  "ZGV-100x100": TUBE_PLUG_PALETTE,
  "ZGV-D20": TUBE_PLUG_PALETTE,
  "ZGV-D22": TUBE_PLUG_PALETTE,
  "ZGV-D25": TUBE_PLUG_PALETTE,
  "KREPSS-PRO": KREPSS_PALETTE,
  "KR-50": TOWBAR_PALETTE,

};

/** Категория → палитра (fallback для будущих SKU без явного маппинга). */
export const CATEGORY_PALETTES: Record<string, Swatch[]> = {
  "Для производства сэндвич-панелей": BLACK_PALETTE,
};

/** Палитра позиции: null — у SKU нет ни одной материальной вариации. */
export function paletteForProduct(p: { sku: string; category: string }): Swatch[] | null {
  const pal = SKU_PALETTES[p.sku] ?? CATEGORY_PALETTES[p.category] ?? null;
  return pal && pal.length > 0 ? pal : null;
}

/** Базовый (единственный) цвет позиции — для сквозной передачи в корзину. */
export function baseColorForProduct(p: { sku: string; category: string }): ColorRef {
  const sw = paletteForProduct(p)?.[0];
  return sw ? { label: sw.label, hex: sw.hex } : { label: "Чёрный", hex: "#000000" };
}

/** Требует ли позиция выбора цвета (в БД заложено больше одной вариации). */
export const hasColorVariants = (p: { sku: string; category: string }) =>
  (paletteForProduct(p)?.length ?? 0) > 1;

/* ------------------------------------------------------------------ *
 * NLP-словарь цветовых маркеров (падежи, синонимы, «народные» названия)
 * ------------------------------------------------------------------ */

export type ColorEntry = { canonical: string; syn: string[] };

/**
 * Каждый элемент — семантическая группа. `syn` пишутся усечёнными
 * основами без окончаний, чтобы покрыть падежи: «венге», «серая», «серого».
 */
export const COLOR_DICTIONARY: ColorEntry[] = [
  { canonical: "Ясень шимо светлый", syn: ["шимо светл", "ясень шимо", "бамбук", "ясен"] },
  { canonical: "Анкор светлый", syn: ["анкор"] },
  { canonical: "Венге", syn: ["венге"] },
  { canonical: "Бук", syn: ["бук"] },
  { canonical: "Вишня", syn: ["вишн"] },
  { canonical: "Махагон", syn: ["махагон", "красно-коричнев", "красно коричнев"] },
  { canonical: "Орех тёмный", syn: ["орех темн", "темный орех", "темн орех"] },
  { canonical: "Орех светлый", syn: ["орех светл", "светлый орех"] },
  { canonical: "Орех", syn: ["орех"] },
  { canonical: "Дуб", syn: ["дуб"] },
  { canonical: "Тёмно-коричневый", syn: ["темно-коричнев", "темно коричнев", "темнокоричнев"] },
  { canonical: "Светло-коричневый", syn: ["светло-коричнев", "светло коричнев", "медн"] },
  { canonical: "Коричневый", syn: ["коричнев"] },
  { canonical: "Чёрный", syn: ["черн", "чёрн", "black"] },
  { canonical: "Белый", syn: ["бел", "white"] },
  { canonical: "Серый", syn: ["сер", "grey", "gray"] },
  { canonical: "Бежевый", syn: ["беж", "песочн", "слонов", "кремов"] },
  { canonical: "Синий", syn: ["син", "blue"] },
  { canonical: "Голубой", syn: ["голуб"] },
  { canonical: "Жёлтый", syn: ["желт", "жёлт", "yellow"] },
  { canonical: "Зелёный", syn: ["зелен", "зелён", "green"] },
  { canonical: "Мятный / Бирюзовый", syn: ["мятн", "бирюз"] },
  { canonical: "Полупрозрачный", syn: ["прозрачн", "полупрозрачн", "натуральн", "матов"] },
];

/** Ориентировочные HEX для цветов, которых нет в палитре артикула. */
export const DICTIONARY_HEX: Record<string, string> = {
  "Ясень шимо светлый": "#e1c699",
  "Анкор светлый": "#d8cbb3",
  Венге: "#3e2723",
  Бук: "#d4a373",
  Вишня: "#722f37",
  Махагон: "#7b3f2f",
  "Орех тёмный": "#5b3a24",
  "Орех светлый": "#a9764e",
  Орех: "#8b5a2b",
  Дуб: "#c8a165",
  "Тёмно-коричневый": "#4a2c11",
  "Светло-коричневый": "#a05a45",
  Коричневый: "#6b4423",
  "Чёрный": "#000000",
  "Белый": "#ffffff",
  "Серый": "#808080",
  "Бежевый": "#e8d5c4",
  "Синий": "#1976d2",
  "Голубой": "#1e88e5",
  "Жёлтый": "#fdd835",
  "Зелёный": "#2e7d32",
  "Мятный / Бирюзовый": "#4dd0c1",
  "Полупрозрачный": "#e8eaed",
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Экранирование для сборки RegExp из словарных основ. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type ColorExtraction = {
  /** «Чистое» ядро строки без цветовых токенов — для нечёткого поиска. */
  core: string;
  /** Канонические цвета, найденные в строке (в порядке появления). */
  colors: string[];
};

/**
 * Первый проход: находим и вырезаем цветовые маркеры из клиентской строки.
 * «Заглушка евровинта Ясень шимо светлый (Бамбук) d15» →
 * core: «заглушка евровинта d15», colors: ['Ясень шимо светлый'].
 */
export function extractColors(raw: string): ColorExtraction {
  let s = norm(String(raw ?? ""));
  const found: Array<{ canonical: string; at: number }> = [];

  for (const entry of COLOR_DICTIONARY) {
    let at = -1;
    for (const syn of entry.syn) {
      const re = new RegExp(`(^|[^а-яa-z0-9])${esc(norm(syn))}[а-я]{0,4}`, "gi");
      const m = re.exec(s);
      if (!m) continue;
      if (at < 0) at = m.index;
      // Вырезаем все синонимы группы: «Ясень шимо светлый (Бамбук)» уходит целиком,
      // и «светлая» больше не сбивает нечёткий поиск.
      s = s.replace(re, "$1 ");
    }
    if (at >= 0) found.push({ canonical: entry.canonical, at });
  }

  const core = s
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    core: core || norm(raw),
    colors: found.sort((a, b) => a.at - b.at).map((f) => f.canonical),
  };
}

/** Совпадает ли образец палитры с каноническим цветом из словаря. */
function swatchMatches(sw: Swatch, canonical: string): boolean {
  const label = norm(sw.label);
  const entry = COLOR_DICTIONARY.find((e) => e.canonical === canonical);
  const syns = entry ? entry.syn : [canonical];
  return syns.some((x) => label.includes(norm(x)));
}

export type ColorResolution = {
  color: ColorRef;
  /** Цвет реально распознан в строке клиента. */
  recognized: boolean;
  /** Позиция вариативная, но цвет в смете не указан / не найден в палитре. */
  warning: string | null;
};

/**
 * Второй проход: канонические цвета → конкретный образец палитры товара.
 * Для моноцветовых позиций и услуг всегда возвращается корректный дефолт.
 */
export function resolveColor(
  product: { sku: string; category: string; is_service?: boolean } | null | undefined,
  canonicals: string[],
): ColorResolution {
  if (!product) return { color: DEFAULT_COLOR, recognized: false, warning: null };
  const palette = paletteForProduct(product);

  if (!palette) {
    // Услуга или позиция без материальных свойств — дефолт без предупреждений.
    return {
      color: product.is_service ? DEFAULT_COLOR : baseColorForProduct(product),
      recognized: false,
      warning: null,
    };
  }
  if (palette.length === 1) {
    const sw = palette[0]!;
    return { color: { label: sw.label, hex: sw.hex }, recognized: false, warning: null };
  }

  for (const canonical of canonicals) {
    const hit = palette.find((sw) => swatchMatches(sw, canonical));
    if (hit) {
      return { color: { label: hit.label, hex: hit.hex }, recognized: true, warning: null };
    }
  }

  if (canonicals.length) {
    // Цвет клиента распознан, но отсутствует в палитре артикула. Не подменяем его
    // первым образцом: иначе две разные строки сметы слипнутся в одну позицию.
    const label = canonicals[0]!;
    return {
      color: { label, hex: DICTIONARY_HEX[label] ?? "#cccccc" },
      recognized: false,
      warning: `Цвет «${label}» не заявлен в палитре артикула — подтвердите или выберите из списка`,
    };
  }

  const first = palette[0]!;
  return {
    color: { label: first.label, hex: first.hex },
    recognized: false,
    warning: `Позиция выпускается в ${palette.length} цветах. Цвет не указан в файле — подставлен «${first.label}»`,
  };
}
