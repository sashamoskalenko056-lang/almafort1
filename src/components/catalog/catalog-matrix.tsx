import { trackAddToCart } from "@/lib/metrika";
import { useState } from "react";
import { stockLimit, useCart } from "@/store/cart-store";
import { Check, Loader2, MessageSquareQuote, Minus, Plus, ShoppingCart } from "lucide-react";
import { PRODUCTS, isOnRequest, tierOf, type Product } from "@/data/catalog";
import { formatPrice, lineTotal } from "@/lib/pricing";
import { searchCatalog } from "@/lib/search-index";
import { toast } from "sonner";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { AssetLightbox } from "@/components/catalog/asset-lightbox";
import { useAssetGroups, type AssetGroup } from "@/lib/asset-groups";

import {
  baseColorForProduct,
  paletteForProduct,
  type ColorSwatch,
} from "@/components/catalog/product-sheet";

type Props = {
  query: string;
  onOpenProduct: (p: Product, colorHex?: string) => void;
  onAdd: (p: Product, qty: number, color?: { label: string; hex: string }) => void;
};




/** Персистентный маркер «позиция уже в спецификации» с микро-кружком цвета. */
function InCartBadge({
  quantity,
  color,
  className = "",
}: {
  quantity: number;
  color?: { label: string; hex: string } | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-700 ${className}`}
      title={color ? `В корзине · ${color.label}` : "В корзине"}
    >
      {color && (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-gray-400"
          style={{ backgroundColor: color.hex }}
        />
      )}
      <span className="whitespace-nowrap tabular-nums">
        В корзине: {quantity.toLocaleString("ru-RU")} шт
      </span>
    </span>
  );
}

// Общая база ячейки: границы и hover-подсветка живут на ячейках,
// т.к. сама строка — display: contents и не рисует бокс.
const CELL =
  "catalog-cell border-b border-border transition-colors duration-200 group-hover/row:bg-surface";


/** Общая логика строки каталога: количество, добавление в корзину, статус кнопки. */
function useRowState(p: Product, onAdd: Props["onAdd"]) {
  const [qty, setQty] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  // Персистентный статус строки: берём из корзины, а не из локального счётчика,
  // чтобы после перезагрузки снабженец видел, что позиция уже в спецификации.
  // Строк по одному SKU может быть несколько (разные цвета) — суммируем для бейджа.
  const inCart = useCart((s) =>
    s.lines.reduce((a, l) => (l.sku === p.sku ? a + l.quantity : a), 0),
  );
  // Свотч в бейдже показываем, только если цвет у позиции один (иначе — смешанный набор).
  const cartColorKey = useCart((s) => {
    const own = s.lines.filter((l) => l.sku === p.sku);
    return own.length === 1 ? `${own[0]!.color?.label ?? ""}|${own[0]!.color?.hex ?? ""}` : "";
  });
  const cartColor = cartColorKey.startsWith("|")
    ? null
    : cartColorKey
      ? { label: cartColorKey.split("|")[0]!, hex: cartColorKey.split("|")[1]! }
      : null;
  const [quote, setQuote] = useState(false);
  const onRequest = isOnRequest(p);
  const tier = tierOf(qty, p);
  const palette = paletteForProduct(p);
  // Базовый цвет предвыбран программно — «слепых» позиций в корзине не бывает.
  const [colorIndex, setColorIndex] = useState(0);
  const color = palette
    ? { label: palette[colorIndex]!.label, hex: palette[colorIndex]!.hex }
    : baseColorForProduct(p);

  // Складской потолок: общий на артикул, уже занятое другими цветами вычитаем.
  const limit = stockLimit(p.sku);
  const limited = Number.isFinite(limit);
  const maxQty = limited ? Math.max(0, limit - inCart) : Number.POSITIVE_INFINITY;
  const outOfStock = limited && limit <= 0;
  const atMax = limited && qty >= maxQty;

  /** Автокоррекция ввода до доступного остатка + строгий фидбэк. */
  const clampQty = (value: number) => {
    if (!limited || value <= maxQty) return value;
    toast.error(`Доступно для заказа только ${Math.max(0, maxQty).toLocaleString("ru-RU")} шт.`);
    return Math.max(0, maxQty);
  };

  const add = async () => {
    if (onRequest) {
      setQuote(true);
      return;
    }
    // Защита от дребезга: серия быстрых тапов не создаёт дубликаты позиций
    if (state !== "idle") return;
    if (outOfStock) {
      toast.error("Нет в наличии");
      return;
    }
    const safeQty = clampQty(qty);
    if (safeQty !== qty) setQty(safeQty);
    if (safeQty <= 0) {
      toast.error("Укажите количество");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/cart", {
        signal: AbortSignal.timeout(20_000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: p.sku, quantity: safeQty }),
      });
      if (!res.ok) throw new Error("cart");
      const data = (await res.json()) as { quantity: number };
      const applied = clampQty(Math.max(1, Math.floor(data.quantity)));
      onAdd(p, applied, color);
      trackAddToCart({ sku: p.sku, name: p.name, price: p.price, quantity: applied });
      setState("done");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
      toast.error("Не удалось добавить позицию — повторите");
    }
  };

  const hasSum = !onRequest && qty > 0 && state !== "done";

  const label = onRequest
    ? "Расчёт"
    : state === "done"
      ? "Добавлено"
      : hasSum
        ? formatPrice(lineTotal(p, qty))
        : inCart > 0
          ? `В корзине · ${inCart.toLocaleString("ru-RU")} шт`
          : null;



  return {
    qty,
    setQty,
    inCart,
    cartColor,
    state,
    quote,
    setQuote,
    onRequest,
    tier,
    add,
    hasSum,
    label,
    palette,
    colorIndex,
    setColorIndex,
    maxQty,
    limited,
    outOfStock,
    atMax,
    clampQty,
  };

}


function StockCell({ p }: { p: Product }) {
  const color =
    p.stock.qty > 10000
      ? "bg-[oklch(0.62_0.16_150)]"
      : p.stock.qty > 0
        ? "bg-[oklch(0.78_0.15_85)]"
        : "bg-primary";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className={`size-2 shrink-0 rounded-full ${color}`} />
      <span className="text-sm tabular-nums text-foreground">
        {p.stock.qty > 0 ? `${p.stock.qty.toLocaleString("ru-RU")} шт` : p.stock.lead}
      </span>
    </span>
  );
}

function Checkbox({ label }: { label: string }) {
  return (
    <label className="relative flex size-[18px] cursor-pointer items-center justify-center">
      <input type="checkbox" aria-label={label} className="peer sr-only" />
      <span className="size-[18px] rounded-[4px] border border-[oklch(0.85_0.005_264)] bg-card transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/30" />
      <Check
        className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
        strokeWidth={3}
      />
    </label>
  );
}

/** Мобильная карточка позиции: таблица на 10 колонок не живёт на 360px. */
function MobileCard({
  p,
  group,
  onOpenProduct,
  onAdd,
}: { p: Product; group?: AssetGroup | undefined } & Omit<Props, "query">) {
  const [lightbox, setLightbox] = useState(false);
  const { qty, setQty, state, quote, setQuote, onRequest, tier, add, hasSum, palette, colorIndex, setColorIndex, inCart, cartColor, maxQty, limited, outOfStock, atMax, clampQty } = useRowState(
    p,
    onAdd,
  );

  const thumb = group?.images[0]?.thumb_url ?? null;
  const unit = tier === 2 ? p.price5000 : tier === 1 ? p.price1000 : p.price;
  const cap = limited ? maxQty : 9_999_999;
  const bump = (d: number) => setQty((v) => Math.max(0, Math.min(cap, v + d)));


  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-3">
        {onRequest ? (
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white p-1"
          >
            {thumb ? (
              <img
                src={thumb}
                alt={p.name}
                width={64}
                height={64}
                loading="lazy"
                className="block size-full object-contain object-center transition-transform duration-300 hover:scale-110"
              />
            ) : (
              <ProductThumb src={p.image_url} alt={p.name} />
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (thumb ? setLightbox(true) : onOpenProduct(p))}
            aria-label={`Открыть ${p.sku}`}
            className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white p-1"
          >
            {thumb ? (
              <img
                src={thumb}
                alt={p.name}
                width={64}
                height={64}
                loading="lazy"
                className="block size-full object-contain object-center transition-transform duration-300 hover:scale-110"
              />
            ) : (
              <ProductThumb src={p.image_url} alt={p.name} />
            )}
          </button>
        )}

        <div className="min-w-0 flex-1">
          {onRequest ? (
            <span className="tap-sm block w-full break-words text-left text-[15px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
              {p.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onOpenProduct(p, palette?.[colorIndex]?.hex)}
              className="tap-sm block w-full break-words text-left text-[15px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]"
            >
              {p.name}
            </button>
          )}
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">{p.sku}</p>
          <p className="mt-1 text-xs leading-[1.35] text-muted-foreground">{p.dims}</p>
          <div className="mt-1.5">
            <StockCell p={p} />
          </div>
        </div>
      </div>

      {/* Цена: перечёркнутая базовая + актуальная для введённого объёма */}
      <div className="mt-3 flex items-baseline gap-2">
        {onRequest ? (
          <span className="rounded-sm bg-[#F3F4F6] px-2 py-1 text-xs font-semibold text-muted-foreground">
            Цена по запросу
          </span>
        ) : (
          <>
            {tier > 0 && qty > 0 && (
              <span className="text-sm tabular-nums text-[#9CA3AF] line-through">
                {formatPrice(p.price)}
              </span>
            )}
            <span className="text-lg font-extrabold tabular-nums text-foreground">
              {formatPrice(unit)}
            </span>
            <span className="text-xs text-muted-foreground">
              /шт{tier > 0 && qty > 0 ? ` · Опт ${tier}` : ""}
            </span>
          </>
        )}
      </div>

      {!onRequest && (
        <div className="no-select mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
          <button
            type="button"
            onClick={() => bump(-Math.min(qty, 100) || -1)}
            disabled={outOfStock}
            aria-label="Уменьшить количество"
            className="grid h-11 place-items-center rounded-md border border-[#D1D5DB] bg-card text-foreground active:scale-95 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            <Minus className="size-4" strokeWidth={2} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={qty || ""}
            max={limited ? maxQty : undefined}
            disabled={outOfStock}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 7);
              setQty(digits ? Number.parseInt(digits, 10) : 0);
            }}
            onBlur={() => setQty((v) => clampQty(v))}
            placeholder="0"
            aria-label={`Количество ${p.sku}`}
            className="h-11 w-full rounded-md border border-[#D1D5DB] bg-card px-3 text-center tabular-nums text-foreground outline-none focus:border-foreground disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-gray-300"
          />
          <button
            type="button"
            onClick={() => bump(100)}
            disabled={outOfStock || atMax}
            aria-label="Увеличить количество"
            className="grid h-11 place-items-center rounded-md border border-[#D1D5DB] bg-card text-foreground active:scale-95 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => void add()}
        disabled={state === "loading" || outOfStock}
        className={`mt-3 flex min-h-[48px] w-full flex-nowrap items-center justify-center gap-x-1 whitespace-nowrap rounded-lg text-xs sm:text-sm font-semibold tabular-nums shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none ${
          outOfStock
            ? "border border-border bg-muted text-muted-foreground"
            : state === "done"
              ? "bg-[#10B981] text-white"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {state === "loading" ? (
          <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={1.75} />
        ) : state === "done" ? (
          <Check className="size-4 shrink-0" strokeWidth={2} />
        ) : onRequest ? (
          <MessageSquareQuote className="size-4 shrink-0" strokeWidth={1.75} />
        ) : (
          <ShoppingCart className="size-4 shrink-0" strokeWidth={1.75} />
        )}
        <span className="shrink-0">
          {outOfStock
            ? "Нет в наличии"
            : state === "loading"
              ? "Добавляем…"
              : state === "done"
                ? "Добавлено"
                : onRequest
                  ? "Запросить расчёт"
                  : "В корзину"}
        </span>
        {!outOfStock && state !== "loading" && state !== "done" && !onRequest && hasSum && (
          <>
            <span aria-hidden className="shrink-0">·</span>
            <span className="shrink-0">{qty.toLocaleString("ru-RU")} шт</span>
            <span aria-hidden className="shrink-0">·</span>
            <span className="shrink-0 tabular-nums">{formatPrice(lineTotal(p, qty))}</span>
          </>
        )}
      </button>

      {inCart > 0 && (
        <div className="mt-2 flex justify-center">
          <InCartBadge quantity={inCart} color={cartColor} />
        </div>
      )}

      {quote && <QuoteRequestModal sku={p.sku} name={p.name} onClose={() => setQuote(false)} />}
      {lightbox && group && (
        <AssetLightbox product={p} group={group} onClose={() => setLightbox(false)} onAdd={onAdd} />
      )}
    </li>
  );
}

function Row({
  p,
  group,
  onOpenProduct,
  onAdd,
}: { p: Product; group?: AssetGroup | undefined } & Omit<Props, "query">) {
  const [lightbox, setLightbox] = useState(false);
  const { qty, setQty, state, quote, setQuote, onRequest, tier, add, hasSum, label, palette, colorIndex, setColorIndex, inCart, cartColor, maxQty, limited, outOfStock, clampQty } = useRowState(
    p,
    onAdd,
  );

  const threshold = (level: 0 | 1 | 2) =>
    level === 0 ? "от 1 шт" : `от ${(level === 1 ? p.tier1Qty : p.tier2Qty).toLocaleString("ru-RU")} шт`;

  const priceCell = (value: number, level: 0 | 1 | 2) => {
    if (onRequest)
      return (
        <div className={`${CELL} justify-end`}>
          <span className="inline-block whitespace-nowrap rounded-sm bg-[#F3F4F6] px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            По запросу
          </span>

        </div>
      );
    const active = tier === level && qty > 0;
    const struck = qty > 0 && level < tier;
    return (
      <div
        title={threshold(level)}
        className={`${CELL} justify-end whitespace-nowrap text-sm tabular-nums ${
          active
            ? "bg-[#E8F5E9] font-bold text-foreground group-hover/row:bg-[#E8F5E9]"
            : struck
              ? "text-[#9CA3AF] line-through"
              : "text-foreground"
        }`}
      >
        {formatPrice(value)}
      </div>
    );
  };

  return (
    <div
      data-in-cart={inCart > 0 ? "true" : undefined}
      className={`catalog-row group/row scroll-mt-[150px] ${inCart > 0 ? "[&_.catalog-cell]:bg-gray-50/70" : ""}`}
    >
      <div className={`${CELL} justify-center`}>
        <Checkbox label={`Выбрать ${p.sku}`} />
      </div>
      <div className={CELL}>
        {group?.images[0] ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={`Открыть фото ${p.sku}`}
            className="tap-sm block size-10 shrink-0 cursor-zoom-in overflow-hidden rounded-[6px] bg-white transition-transform duration-150 hover:scale-105"
          >
            <img
              src={group.images[0].thumb_url}
              alt={p.name}
              width={40}
              height={40}
              loading="lazy"
              className="block size-10 object-contain object-center"
            />
          </button>
        ) : (
          <span className="block w-10">
            <ProductThumb src={p.image_url} alt={p.name} />
          </span>
        )}
      </div>

      <div
        className={`${CELL} sticky left-0 z-[5] flex-col items-start justify-center bg-card shadow-[6px_0_8px_-6px_oklch(0_0_0/0.18)] group-hover/row:bg-surface md:static md:shadow-none`}
      >
        {onRequest ? (
          <span
            title={p.name}
            className="block w-full whitespace-normal text-left text-sm font-medium leading-snug text-[oklch(0.19_0.01_264)] line-clamp-2"
          >
            {p.name}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onOpenProduct(p, palette?.[colorIndex]?.hex)}
            title={p.name}
            className="tap-sm block w-full cursor-pointer whitespace-normal text-left text-sm font-medium leading-snug text-[oklch(0.19_0.01_264)] transition-colors hover:text-primary line-clamp-2"
          >
            {p.name}
          </button>
        )}
        <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs tabular-nums text-[oklch(0.55_0.01_264)]">
          {p.sku}
        </span>
      </div>
      <div className={`${CELL} text-sm text-muted-foreground`}>
        <span
          className="w-full whitespace-normal break-words leading-[1.2]"
          title={p.dims}
        >
          {p.dims}
        </span>
      </div>
      <div className={CELL}>
        <StockCell p={p} />
      </div>
      {priceCell(p.price, 0)}
      {priceCell(p.price1000, 1)}
      {priceCell(p.price5000, 2)}
      <div className={CELL}>
        <input
          type="text"
          inputMode="numeric"
          value={qty || ""}
          max={limited ? maxQty : undefined}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 7);
            setQty(digits ? Number.parseInt(digits, 10) : 0);
          }}
          onBlur={() => setQty((v) => clampQty(v))}
          placeholder={onRequest ? "—" : outOfStock ? "—" : "0"}
          disabled={onRequest || outOfStock}
          aria-label={`Количество ${p.sku}`}
          className="h-10 w-full min-w-0 rounded-lg border border-border bg-muted/40 px-3 text-center text-sm font-medium tabular-nums text-foreground outline-none transition-all duration-150 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        />
      </div>
      <div className={`${CELL} flex-col items-stretch justify-center gap-1`}>
        <button
          type="button"
          onClick={() => void add()}
          disabled={state === "loading" || outOfStock}
          aria-label={onRequest ? "Запросить индивидуальный расчет" : "Добавить в корзину"}
          className={`group flex h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-3 text-xs font-semibold tabular-nums shadow-sm transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:shadow-none ${
            outOfStock
              ? "border border-border bg-muted text-muted-foreground"
              : state === "done"
              ? "bg-[#10B981] text-white"
              : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md"
          }`}
        >

          {state === "loading" ? (
            <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={1.75} />
          ) : state === "done" ? (
            <Check className="size-4 shrink-0" strokeWidth={2} />
          ) : onRequest ? (
            <MessageSquareQuote className="size-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <ShoppingCart className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          {state === "loading" ? null : (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {outOfStock ? "Нет в наличии" : label}
            </span>
          )}
        </button>
        {inCart > 0 && (
          <InCartBadge quantity={inCart} color={cartColor} className="mt-1 self-center" />
        )}
      </div>
      {quote && (
        <QuoteRequestModal sku={p.sku} name={p.name} onClose={() => setQuote(false)} />
      )}
      {lightbox && group && (
        <AssetLightbox product={p} group={group} onClose={() => setLightbox(false)} onAdd={onAdd} />

      )}
    </div>

  );
}

export function CatalogMatrix({ query, onOpenProduct, onAdd }: Props) {
  const assets = useAssetGroups();
  const rows =
    query.trim().length >= 2
      ? (() => {
          const hits = searchCatalog(query, 50);
          const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
          return hits.map((h) => bySku.get(h.sku)).filter((p): p is Product => Boolean(p));
        })()
      : PRODUCTS;


  const headers = [
    "",
    "Фото",
    "Артикул и название",
    "Габариты",
    "Наличие",
    "Базовая",
    "Опт 1",
    "Опт 2",
    "Кол-во",
    "",
  ];

  const empty = rows.length === 0 && (
    <p className="px-3 py-10 text-center text-sm text-muted-foreground">
      Позиции не найдены — уточните артикул или параметры.
    </p>
  );

  return (
    <>
      {/* Мобильная витрина: карточки вместо таблицы на 10 колонок */}
      <ul className="space-y-3 md:hidden">
        {rows.map((p) => (
          <MobileCard
            key={p.id}
            p={p}
            group={assets.get(p.sku)}
            onOpenProduct={onOpenProduct}
            onAdd={onAdd}
          />
        ))}
      </ul>
      {empty}

      <div className="table-container hidden md:block">
        {/* Шапка: тот же шаблон колонок, sticky относительно страницы */}
        <div className="catalog-grid-header sticky top-[72px] z-20 border-b-2 border-[oklch(0.91_0.004_247.9)] bg-card">
          {headers.map((h, i) => (
            <div
              key={i}
              className={`catalog-cell whitespace-nowrap text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground ${
                i >= 5 && i <= 7 ? "justify-end" : ""
              }`}
            >
              {h}
            </div>
          ))}
        </div>

        <div className="catalog-grid-parent">
          {rows.map((p) => (
            <Row
              key={p.id}
              p={p}
              group={assets.get(p.sku)}
              onOpenProduct={onOpenProduct}
              onAdd={onAdd}
            />

          ))}
        </div>
      </div>
    </>
  );
}
