import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ParsingSkeleton, SpecUpload } from "@/components/cart/spec-upload";
import { useCart, cartTotals } from "@/store/cart-store";
import { SearchPanel } from "@/components/catalog/search-panel";
import { CatalogMatrix } from "@/components/catalog/catalog-matrix";
import { formatPrice } from "@/lib/pricing";
import {
  ProductSheet,
  descriptionForProduct,
  paletteForProduct,
} from "@/components/catalog/product-sheet";
import { JsonLd, catalogJsonLd } from "@/lib/jsonld";
import { AiConfigurator } from "@/components/catalog/ai-configurator";
import { ModuleErrorBoundary } from "@/components/error-boundary";
import { PRODUCTS, type Product } from "@/data/catalog";
import { CATEGORY_FACETS } from "@/lib/seo";
import { BackLink } from "@/components/back-link";

export const Route = createFileRoute("/catalog/")({
  head: () => ({
    meta: [
      { title: "Каталог ALMAFORT — прайс-матрица пластиковых комплектующих" },
      {
        name: "description",
        content:
          "B2B-терминал ALMAFORT: поиск по артикулу и фото, матрица оптовых цен, наличие на складе, чертежи DWG и STEP, расчёт доставки.",
      },
      { property: "og:title", content: "Каталог ALMAFORT — прайс-матрица для снабженцев" },
      {
        property: "og:description",
        content:
          "Умный поиск, оптовые тиры цен, остатки склада и инженерная документация в одном интерфейсе.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://almafort.ru/catalog" },
    ],
    links: [{ rel: "canonical", href: "https://almafort.ru/catalog" }],
  }),
  component: CatalogPage,
});

const BASE_PATH = "/catalog";

/** Собирает deep-link карточки: ?product=SKU&color=HEX. */
function productHref(sku: string, hex?: string | null) {
  const params = new URLSearchParams({ product: sku });
  if (hex) params.set("color", hex.replace("#", ""));
  return `${BASE_PATH}?${params.toString()}`;
}

function CatalogPage() {
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [colorHex, setColorHex] = useState<string | undefined>(undefined);
  const [upload, setUpload] = useState(false);
  const lines = useCart((s) => s.lines);
  const parsing = useCart((s) => s.parsing);
  const addLine = useCart((s) => s.addLine);
  const cart = { lines: lines.length, total: cartTotals(lines).goods };

  // Открытие карточки синхронизируется с адресной строкой: ссылкой можно
  // поделиться со снабженцем, и он увидит тот же товар в том же цвете.
  const openProduct = useCallback((p: Product, hex?: string) => {
    setProduct(p);
    setColorHex(hex);
    if (typeof window !== "undefined") {
      window.history.pushState({ product: p.sku }, "", productHref(p.sku, hex ?? null));
    }
  }, []);

  const closeProduct = useCallback(() => {
    setProduct(null);
    setColorHex(undefined);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", BASE_PATH);
    }
  }, []);

  // Перехват параметров при первой загрузке и при навигации «назад/вперёд».
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const sku = params.get("product") ?? params.get("sku") ?? params.get("item");

      if (!sku) {
        setProduct(null);
        setColorHex(undefined);
        return;
      }
      const found = PRODUCTS.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
      if (!found) return;
      const raw = params.get("color");
      setProduct(found);
      setColorHex(raw ? (raw.startsWith("#") ? raw : `#${raw}`) : undefined);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const structuredData = useMemo(
    () =>
      catalogJsonLd(
        PRODUCTS.slice(0, 60).map((p) => {
          const palette = paletteForProduct(p);
          return {
            product: p,
            description: descriptionForProduct(p),
            ...(palette ? { colors: palette.map((c) => ({ label: c.label, hex: c.hex })) } : {}),
          };
        }),
      ),
    [],
  );

  const add = (p: Product, qty: number, color?: { label: string; hex: string }) => {
    addLine(p.sku, qty, undefined, color);
    toast.success(
      `${p.sku} · ${qty.toLocaleString("ru-RU")} шт добавлено${color ? ` (${color.label})` : ""}`,
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="w-full flex-1 mx-auto max-w-[1440px] px-5 pb-24 pt-10 lg:px-10">
        <div className="mb-6">
          <BackLink fallback="/" label="Назад" />
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-[44px]">
            Каталог серийной продукции
          </h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-[1.5] text-muted-foreground lg:text-base">
            Прайс-матрица с остатками склада, тремя уровнями оптовых цен и инженерной
            документацией. Цена пересчитывается прямо в строке при вводе количества.
          </p>
        </header>

        <nav aria-label="Разделы каталога" className="mb-8 flex flex-wrap justify-center gap-2">
          {CATEGORY_FACETS.map((c) => (
            <a
              key={c.slug}
              href={`/catalog/${c.slug}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-primary hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {c.label}
            </a>
          ))}
        </nav>

        <SearchPanel
          query={query}
          onQuery={setQuery}
          onPick={(p) => openProduct(p)}
          onScanChange={setScanning}
        />

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setUpload((v) => !v)}
            className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 sm:w-auto text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:border-primary hover:text-primary hover:shadow-md"
          >
            <FileSpreadsheet className="size-4" strokeWidth={1.75} />
            Загрузить спецификацию Excel
          </button>
        </div>

        {upload && (
          <div className="mx-auto mt-4 w-full lg:w-[70%]">
            {parsing ? <ParsingSkeleton /> : <SpecUpload />}
          </div>
        )}

        <section
          className={`mt-10 transition-all duration-300 ${scanning ? "blur-sm" : ""}`}
          aria-label="Матрица каталога"
        >
          <CatalogMatrix query={query} onOpenProduct={openProduct} onAdd={add} />
        </section>

        <ModuleErrorBoundary title="ИИ-конфигуратор узла" hint="Соберите спецификацию через каталог — остальные разделы работают.">
          <AiConfigurator />
        </ModuleErrorBoundary>
      </main>

      {cart.lines > 0 && (
        <div className="above-tabbar-float fixed inset-x-3 z-30 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[0_16px_40px_oklch(0_0_0/0.12)] sm:inset-x-auto sm:left-1/2 sm:bottom-6 sm:w-auto sm:-translate-x-1/2 sm:rounded-full sm:px-6">
          <span className="min-w-0">
            <span className="text-muted-foreground">Позиций: </span>
            <span className="font-semibold text-foreground">{cart.lines}</span>
            <span className="mx-2 text-border">|</span>
            <span className="font-bold tabular-nums text-primary">{formatPrice(cart.total)}</span>
          </span>
          <a
            href="/cart"
            className="flex h-11 shrink-0 cursor-pointer items-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Оформить счёт
          </a>
        </div>
      )}


      <ProductSheet
        product={product}
        initialColorHex={colorHex}
        onColorChange={(c) => {
          setColorHex(c.hex);
          if (product && typeof window !== "undefined") {
            window.history.replaceState(
              { product: product.sku },
              "",
              productHref(product.sku, c.hex),
            );
          }
        }}
        onClose={closeProduct}
      />
      <JsonLd data={structuredData} />
    </div>
  );
}
