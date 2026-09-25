// Клиентская генерация PDF-счёта через pdfmake (без Chromium/Puppeteer).
import { toast } from "sonner";
import { runPdfJob } from "@/lib/pdf-queue";
import type { CartLine, Carrier } from "@/store/cart-store";
import { linePrice, productBySku, deliveryCost, cartTotals } from "@/store/cart-store";

const CARRIER_LABEL: Record<Carrier, string> = {
  cdek: "СДЭК, до терминала",
  dl: "Деловые Линии, до терминала",
  pickup: "Самовывоз, г. Дивногорск, Нижний проезд 15/1",
};

/**
 * Деградация PDF: сверхдлинные названия юрлиц и артикулы без пробелов
 * не должны вылезать за поля A4 — режем длину и даём точки переноса.
 */
const safeText = (v: unknown, limit = 180) => {
  const raw = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  return raw.replace(/\S{22,}/g, (t) => t.replace(/(.{18})/g, "$1\u200b"));
};

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Факсимиле подписи и печать — inline Base64, чтобы файл открывался без интернета.
const STAMP_BASE64 =
  "data:image/svg+xml;base64," +
  btoa(
    unescape(
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120">
<circle cx="150" cy="60" r="52" fill="none" stroke="#1f4fd8" stroke-width="3"/>
<circle cx="150" cy="60" r="43" fill="none" stroke="#1f4fd8" stroke-width="1.5"/>
<text x="150" y="52" text-anchor="middle" font-family="Helvetica" font-size="13" fill="#1f4fd8">ALMAFORT</text>
<text x="150" y="68" text-anchor="middle" font-family="Helvetica" font-size="8" fill="#1f4fd8">PROIZVODSTVO</text>
<text x="150" y="82" text-anchor="middle" font-family="Helvetica" font-size="8" fill="#1f4fd8">DIVNOGORSK</text>
<path d="M10 80 C40 20, 60 100, 95 45 S130 95, 140 60" fill="none" stroke="#1f4fd8" stroke-width="2.4"/>
</svg>`,
      ),
    ),
  );

/**
 * Миниатюры для счёта: pdfmake не понимает WebP, поэтому перерисовываем фото
 * в 96×96 JPEG на белом фоне. Нет фото или ошибка загрузки — ячейка с прочерком.
 */
async function loadInvoiceThumbs(skus: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (typeof document === "undefined") return out;
  let groups = new Map<string, { images: { thumb_url: string }[] }>();
  try {
    const { fetchAssetGroups } = await import("@/lib/asset-groups");
    groups = await fetchAssetGroups();
  } catch {
    /* без фото счёт всё равно формируется */
  }
  await Promise.all(
    skus.map(async (sku) => {
      const src = groups.get(sku)?.images[0]?.thumb_url ?? productBySku(sku)?.image_url;
      if (!src) return;
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        await Promise.race([img.decode(), new Promise((_, r) => setTimeout(r, 4000))]);
        const c = document.createElement("canvas");
        c.width = c.height = 96;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 96, 96);
        const k = Math.min(96 / img.naturalWidth, 96 / img.naturalHeight);
        const w = img.naturalWidth * k, h = img.naturalHeight * k;
        ctx.drawImage(img, (96 - w) / 2, (96 - h) / 2, w, h);
        out.set(sku, c.toDataURL("image/jpeg", 0.85));
      } catch {
        /* пропускаем */
      }
    }),
  );
  return out;
}

export type InvoiceInput = {
  lines: CartLine[];
  carrier: Carrier;
  city: string;
  /** Стоимость доставки из расчёта ТК; если не передана — локальный фолбэк. */
  delivery?: number;
  /** download — отдать файл пользователю, base64 — вернуть строку для выгрузки в S3/CRM. */
  output?: "download" | "base64";
};

async function generateInvoicePdfImpl({
  lines,
  carrier,
  city,
  delivery: deliveryOverride,
  output = "download",
}: InvoiceInput): Promise<string | void> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = ((pdfMakeModule as unknown as { default?: unknown }).default ??
    pdfMakeModule) as unknown as {
    addVirtualFileSystem: (vfs: Record<string, unknown>) => void;
    addFonts: (fonts: Record<string, unknown>) => void;
    createPdf: (d: unknown) => { download: (n: string) => void; getBase64: () => Promise<string> };
  };
  const vfsSource = ((fontsModule as unknown as { default?: unknown }).default ??
    fontsModule) as Record<string, unknown> & {
    pdfMake?: { vfs?: Record<string, unknown> };
    vfs?: Record<string, unknown>;
  };
  // pdfmake 0.3: шрифты регистрируются явно, иначе рендер молча зависает на Roboto.
  const vfs = vfsSource.pdfMake?.vfs ?? vfsSource.vfs ?? vfsSource;
  pdfMake.addVirtualFileSystem(vfs as Record<string, unknown>);
  pdfMake.addFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });

  const { goods, weight, volume } = cartTotals(lines);
  const delivery =
    carrier === "pickup"
      ? 0
      : typeof deliveryOverride === "number"
        ? deliveryOverride
        : deliveryCost(carrier, weight);
  const total = goods + delivery;

  const date = new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const stamp = `${dd}-${mm}-${date.getFullYear()}`;

  const body: unknown[][] = [
    [
      { text: "№", style: "th" },
      { text: "Фото", style: "th" },
      { text: "Артикул", style: "th" },
      { text: "Наименование", style: "th" },
      { text: "Кол-во", style: "th", alignment: "right" },
      { text: "Цена за ед.", style: "th", alignment: "right" },
      { text: "Сумма", style: "th", alignment: "right" },
    ],
  ];

  // Комплектовщику удобнее собирать заказ по коробкам: сортируем по артикулу,
  // внутри артикула — по цвету.
  const sorted = [...lines].sort(
    (a, b) =>
      a.sku.localeCompare(b.sku, "ru") || (a.color?.label ?? "").localeCompare(b.color?.label ?? "", "ru"),
  );

  const thumbs = await loadInvoiceThumbs([...new Set(sorted.map((l) => l.sku))]);
  sorted.forEach((l, i) => {
    const { unit, sum } = linePrice(l.sku, l.quantity);
    const title = safeText(
      `${productBySku(l.sku)?.name ?? l.name}${l.color ? ` (Цвет: ${l.color.label})` : ""}`,
      200,
    );
    const hex = l.color?.hex ?? "";
    const swatchOk = /^#[0-9a-f]{6}$/i.test(hex);
    const thumb = thumbs.get(l.sku);
    body.push([
      { text: String(i + 1) },
      thumb ? { image: thumb, width: 28, height: 28 } : { text: "—", color: "#9CA3AF", alignment: "center" },
      { text: safeText(l.sku, 40) },
      swatchOk
        ? {
            columns: [
              {
                width: 12,
                canvas: [
                  { type: "rect", x: 0, y: 2, w: 7, h: 7, color: hex, lineWidth: 0.5, lineColor: "#9CA3AF" },
                ],
              },
              { text: title },
            ],
          }
        : { text: title },
      { text: l.quantity.toLocaleString("ru-RU"), alignment: "right" },
      { text: money(unit), alignment: "right" },
      { text: money(sum), alignment: "right" },
    ]);
  });


  if (delivery > 0) {
    body.push([
      { text: String(lines.length + 1) },
      { text: "" },
      { text: "DELIVERY" },
      { text: safeText(`Доставка: ${CARRIER_LABEL[carrier]}${city ? `, ${city}` : ""}`) },
      { text: "1", alignment: "right" },
      { text: money(delivery), alignment: "right" },
      { text: money(delivery), alignment: "right" },
    ]);
  }

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 48],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.25 },
    content: [
      {
        columns: [
          [
            { text: "ALMAFORT", style: "logo" },
            { text: "Производство пластиковых комплектующих", fontSize: 8, color: "#595959" },
          ],
          {
            width: 260,
            stack: [
              { text: "ИП Сазонов Е. О.", bold: true, alignment: "right" },
              {
                text: "Юридический адрес: 660910, Красноярский край, г. Дивногорск, ул. Чкалова, д. 59, кв. 202",
                alignment: "right",
                color: "#595959",
              },
              {
                text: "Адрес склада для самовывоза: г. Дивногорск, Нижний проезд 15/1",
                alignment: "right",
                color: "#595959",
              },
              { text: "ИНН 244313770850 · ОГРНИП 306244323700012", alignment: "right", color: "#595959" },
              { text: "Р/с 40802810931000012345", alignment: "right", color: "#595959" },
              { text: "Банк: Красноярское отделение №8646 ПАО Сбербанк", alignment: "right", color: "#595959" },
              { text: "БИК 040407627 · К/с 30101810800000000627", alignment: "right", color: "#595959" },
            ],
          },
        ],
      },
      { text: " ", margin: [0, 6] },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: "#E52421" }],
      },
      {
        text: `Счёт на оплату № ${date.getTime().toString().slice(-6)} от ${dd}.${mm}.${date.getFullYear()}`,
        style: "h1",
        margin: [0, 14, 0, 12],
      },
      {
        table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths: [18, 34, 64, "*", 45, 55, 60], body },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => "#D1D5DB",
          vLineColor: () => "#D1D5DB",
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
      {
        margin: [0, 14, 0, 0],
        columns: [
          { text: "" },
          {
            width: 260,
            stack: [
              { text: `Товары: ${money(goods)} руб.`, alignment: "right" },
              { text: `Итого вес: ${weight.toLocaleString("ru-RU")} кг`, alignment: "right", color: "#595959" },
              { text: `Итого объём: ${volume.toLocaleString("ru-RU")} м3`, alignment: "right", color: "#595959" },
              {
                text: `Доставка: ${delivery ? `${money(delivery)} руб.` : "самовывоз"}`,
                alignment: "right",
              },
              {
                text: `Итого к оплате: ${money(total)} руб.`,
                alignment: "right",
                bold: true,
                fontSize: 12,
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
      },
      {
        text: "Счёт действителен в течение 3-х банковских дней. Отгрузка производится после поступления средств на расчётный счёт.",
        margin: [0, 16, 0, 0],
        color: "#595959",
      },
      {
        margin: [0, 18, 0, 0],
        columns: [
          {
            stack: [
              { text: "Руководитель производства", color: "#595959" },
              { text: "Сазонов Е. О.", bold: true, margin: [0, 26, 0, 0] },
            ],
          },
          { width: 220, svg: decodeSvg(STAMP_BASE64) },
        ],
      },
    ],
    styles: {
      logo: { fontSize: 20, bold: true, color: "#E52421" },
      h1: { fontSize: 14, bold: true },
      th: { bold: true, fillColor: "#F3F4F6" },
    },
  };

  const doc = pdfMake.createPdf(docDefinition);

  if (output === "base64") {
    return await doc.getBase64();
  }
  doc.download(`Schet_Almafort_${stamp}.pdf`);
}

function decodeSvg(dataUrl: string) {
  return decodeURIComponent(escape(atob(dataUrl.split(",")[1] ?? "")));
}

/** Публичная точка входа: рендер идёт через очередь, параллельных задач нет. */
export function generateInvoicePdf(input: InvoiceInput): Promise<string | void> {
  return runPdfJob(
    () => generateInvoicePdfImpl(input),
    () => toast.info("Счёт формируется (в очереди)..."),
  );
}
