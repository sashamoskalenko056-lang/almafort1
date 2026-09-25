import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { isOnRequest, PRODUCTS, type Product } from "@/data/catalog";
import { BackLink } from "@/components/back-link";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { ProductSheet } from "@/components/catalog/product-sheet";
import { useAssetGroups } from "@/lib/asset-groups";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { formatPrice } from "@/lib/pricing";
import {
  breadcrumbJsonLd,
  COLORS,
  facetDescription,
  facetH1,
  facetProducts,
  facetRobots,
  facetTitle,
  parseFacetPath,
  productJsonLd,
  shapeFacets,
  SITE_URL,
  sizeFacets,
  slugify,
} from "@/lib/seo";

type Search = {
  page?: number | undefined;
  sort?: string | undefined;
  utm_source?: string | undefined;
  sku?: string | undefined;
};

export const Route = createFileRoute("/catalog/$")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    page: search['page'] ? Number(search['page']) : undefined,
    sort: typeof search['sort'] === "string" ? search['sort'] : undefined,
    utm_source: typeof search['utm_source'] === "string" ? search['utm_source'] : undefined,
    sku: typeof search['sku'] === "string" ? search['sku'] : undefined,
  }),

  loader: ({ params }): { facets: ReturnType<typeof parseFacetPath>; items: Product[] } => {
    const segments = (params._splat ?? "").split("/").filter(Boolean);
    const facets = parseFacetPath(segments);
    if (!facets.valid) throw notFound();
    const items = facetProducts(facets);
    return { facets, items };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) {
      return { meta: [{ title: "Раздел не найден — ALMAFORT" }, { name: "robots", content: "noindex" }] };
    }
    const { facets, items } = loaderData;
    const page = Math.max(1, Number((match.search as Search).page ?? 1) || 1);
    const base = facetTitle(facets);
    // Уникализируем Title страниц пагинации.
    const title = page > 1 ? `${base} — страница ${page}` : base;
    const description =
      page > 1
        ? `${facetH1(facets)}: страница ${page} каталога ALMAFORT. Оптовые цены и остатки склада.`
        : facetDescription(facets, items);
    // Канонический URL — всегда чистый путь без ?sort / ?utm_source / ?gclid / ?page
    const canonical = `${SITE_URL}${facets.path}`;
    const robots = facetRobots(facets, items.length, page);
    // Соцкарточка конкретной позиции, если раздел сузился до одного артикула.
    const single = items.length === 1 ? items[0] : undefined;
    const image =
      single && !single.is_service
        ? `${SITE_URL}/icons/icon-512.png`
        : `${SITE_URL}/icons/icon-512.png`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(robots ? [{ name: "robots", content: robots }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product.group" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: FacetPage,
  notFoundComponent: FacetNotFound,
});

function FacetNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto max-w-[900px] px-5 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-foreground">Раздел каталога не найден</h1>
        <p className="mt-3 text-muted-foreground">
          Проверьте адрес или вернитесь в общий каталог.
        </p>
        <Link to="/catalog" className="mt-6 inline-block font-semibold text-primary">
          Перейти в каталог →
        </Link>
      </main>
    </div>
  );
}

function ProductCard({
  p,
  thumb,
  onOpen,
}: {
  p: Product;
  thumb?: string | null;
  onOpen: (p: Product) => void;
}) {
  const [quote, setQuote] = useState(false);
  const onRequest = isOnRequest(p) || p.is_service;

  return (
    <li className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md">
      <div>
        <button
          type="button"
          onClick={() => onOpen(p)}
          aria-label={`Открыть карточку ${p.name}`}
          className="mb-3 flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40 !min-h-0 p-0"
        >
          {thumb ? (
            <img
              src={thumb}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <ProductThumb src={p.image_url} alt={p.name} className="max-h-full" />
          )}
        </button>

        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {p.sku}
        </span>

        <h3
          className="mt-1 line-clamp-3 cursor-pointer text-base font-semibold leading-snug text-foreground transition-colors hover:text-primary"
          title={p.name}
          onClick={() => onOpen(p)}
        >
          {p.name}
        </h3>


        <div className="mt-2.5 flex items-center justify-between gap-2 border-b border-border/70 pb-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{p.dims || "Габариты по запросу"}</span>
          {p.is_service ? (
            <span className="shrink-0 whitespace-nowrap font-medium">Под заказ</span>
          ) : p.stock.qty > 0 ? (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {p.stock.qty.toLocaleString("ru-RU")} шт
            </span>
          ) : (
            <span className="shrink-0 whitespace-nowrap font-medium">{p.stock.lead}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3">
        <div className="min-w-0">
          {onRequest ? (
            <span className="block text-sm font-semibold text-muted-foreground">
              По договоренности
            </span>
          ) : (
            <>
              <span className="block text-xs text-muted-foreground">Опт от 1 шт</span>
              <span className="whitespace-nowrap text-lg font-bold tabular-nums text-foreground">
                {formatPrice(p.price)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ шт</span>
              </span>
            </>
          )}
        </div>

        {onRequest ? (
          <button
            type="button"
            onClick={() => setQuote(true)}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary hover:text-primary active:scale-95"
          >
            Запросить расчет
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90 active:scale-95"
          >
            Подробнее
          </button>
        )}

      </div>

      {quote && <QuoteRequestModal sku={p.sku} name={p.name} onClose={() => setQuote(false)} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productJsonLd(p, `${SITE_URL}/catalog/${slugify(p.category)}/${p.sku.toLowerCase()}`),
          ),
        }}
      />
    </li>
  );
}


function FacetPage() {
  const { facets, items } = Route.useLoaderData() as {
    facets: ReturnType<typeof parseFacetPath>;
    items: Product[];
  };
  const crumbs = [
    { name: "Главная", path: "/" },
    { name: "Каталог", path: "/catalog" },
    ...(facets.category ? [{ name: facets.category.label, path: `/catalog/${facets.category.slug}` }] : []),
    ...(facets.shape && facets.category
      ? [{ name: facets.shape.label, path: `/catalog/${facets.category.slug}/${facets.shape.slug}` }]
      : []),
    ...(facets.size && facets.category && facets.shape
      ? [
          {
            name: facets.size.label,
            path: `/catalog/${facets.category.slug}/${facets.shape.slug}/${facets.size.slug}`,
          },
        ]
      : []),
  ];

  const childShapes = facets.category && !facets.shape ? shapeFacets(facets.category.slug) : [];
  const childSizes =
    facets.category && facets.shape && !facets.size
      ? sizeFacets(facets.category.slug, facets.shape.slug)
      : [];
  const childColors = facets.size && !facets.color ? COLORS : [];
  const page = Math.max(1, Number(Route.useSearch().page ?? 1) || 1);
  const base = facets.path;
  const assetGroups = useAssetGroups();

  // Deep linking: ?sku=ZGV-40x20 открывает карточку товара при загрузке.
  const [active, setActive] = useState<Product | null>(null);

  const openProduct = useCallback((p: Product) => {
    setActive(p);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("sku", p.sku);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

  const closeProduct = useCallback(() => {
    setActive(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("sku");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const sku = new URLSearchParams(window.location.search).get("sku");
      if (!sku) {
        setActive(null);
        return;
      }
      const found =
        items.find((p) => p.sku.toLowerCase() === sku.toLowerCase()) ??
        PRODUCTS.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
      if (found) setActive(found);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [items]);


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto max-w-[1200px] px-4 pb-24 pt-6 sm:px-5 lg:px-10 lg:pt-10">
        <nav aria-label="Хлебные крошки" className="mb-4 flex flex-nowrap items-center overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.path} className="shrink-0">
              {i > 0 && <span className="mx-1.5 text-border">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="text-foreground">{c.name}</span>
              ) : (
                <a href={c.path} className="transition-colors hover:text-foreground">
                  {c.name}
                </a>
              )}
            </span>
          ))}
        </nav>

        <BackLink fallback="/catalog" className="mb-4" />

        <h1 className="text-2xl font-bold leading-[1.1] tracking-tight text-foreground lg:text-[40px]">
          {facetH1(facets)}
        </h1>
        {page === 1 && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {facetDescription(facets, items)}
          </p>
        )}

        {(childShapes.length > 0 || childSizes.length > 0 || childColors.length > 0) && (
          <div
            className="mt-6 flex gap-2 overflow-x-auto pb-1"
            aria-label="Фильтры раздела"
          >
            {[...childShapes, ...childSizes, ...childColors].map((f) => (
              <a
                key={f.slug}
                href={`${base}/${f.slug}`}
                className="whitespace-nowrap rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors duration-200 hover:bg-muted/70 hover:text-primary"
              >
                {f.label}
              </a>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <section className="mt-10 rounded-2xl border border-border bg-card p-6" style={{ minHeight: 200 }}>
            <h2 className="text-lg font-bold text-foreground">Позиции временно отсутствуют</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Раздел пуст — посмотрите родительскую категорию или закажите изготовление партии.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <a className="text-primary" href={facets.category ? `/catalog/${facets.category.slug}` : "/catalog"}>
                ← В родительскую категорию
              </a>
              <a className="text-primary" href="/catalog">Весь каталог</a>
            </div>
          </section>
        )}

        <section className="mt-8" style={{ minHeight: 320 }} aria-label="Позиции раздела">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
            {items.map((p) => (
              <ProductCard
                key={p.sku}
                p={p}
                thumb={assetGroups.get(p.sku)?.images[0]?.thumb_url ?? null}
                onOpen={openProduct}
              />

            ))}
          </ul>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
        />
      </main>
      <ProductSheet product={active} onClose={closeProduct} />
      <SiteFooter />

    </div>
  );
}
