import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  // data:image/webp;base64,... — кадр из камеры, обрезанный по рамке и ужатый до 1024px
  image: z
    .string()
    .min(64)
    .max(4_000_000)
    .refine((v) => v.startsWith("data:image/"), "Ожидается data:image/*"),
  // Память сессии: фото, которые посетитель уже подтвердил (только текст признаков).
  memory: z
    .array(z.object({ sku: z.string().max(40), features: z.string().max(200) }))
    .max(8)
    .optional(),
});

export const Route = createFileRoute("/api/vision/identify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rateLimit } = await import("@/lib/rate-limit.server");
        const limited = rateLimit(request, "vision-identify", { limit: 10, windowMs: 60_000 });
        if (limited) return limited;
        let raw: string;
        let memory: { sku: string; features: string }[] = [];
        try {
          const body = schema.parse(await request.json());
          raw = body.image;
          memory = body.memory ?? [];
        } catch {
          return Response.json({ error: "Некорректный кадр" }, { status: 400 });
        }
        try {
          // Защита от спуфинга: расширению и MIME не верим — проверяем сигнатуру
          // и пересобираем картинку без EXIF/XMP/ICC, только потом отдаём модели.
          const { sanitizeImageDataUrl } = await import("@/lib/image-sanitize.server");
          const clean = sanitizeImageDataUrl(raw);
          if (!clean) {
            return Response.json(
              { error: "Файл не является корректным изображением JPG, PNG или WebP" },
              { status: 400 },
            );
          }
          const image = clean.dataUrl;

          const {
            identifyPart,
            matchProducts,
            classVariants,
            candidateCategories,
            logVisionFail,
            verdictCategory,
          } = await import("@/lib/vision.server");
          const verdict = await identifyPart(image, memory);

          const brief = (p: {
            sku: string;
            name: string;
            dims: string;
            price: number;
            stock: { qty: number; lead?: string };
          }) => ({
            sku: p.sku,
            name: p.name,
            dims: p.dims,
            price: p.price,
            stock: p.stock.qty,
            lead: p.stock.lead ?? null,
          });

          // Маршрутизация по Confidence Score (Блок 3 ТЗ).
          const score = verdict.confidence;
          const category = verdictCategory(verdict);

          // Плохие условия съёмки важнее вердикта: гадать по пикселям запрещено.
          if (verdict.low_light && verdict.status !== "FOREIGN") {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "lowlight", verdict });
          }

          if (verdict.status === "INVALID" || score < 0.1) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "invalid", verdict });
          }

          // Модель прямо сказала «в каталоге такого нет»: артикул не выдумываем,
          // показываем 2–3 ближайших варианта и предлагаем ручной выбор.
          // Мусорный кадр: несколько разных деталей — никаких «похожих» вариантов.
          if (verdict.multiple_objects_detected) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "notfound", verdict, matches: [] });
          }

          if (verdict.status === "NOT_FOUND") {
            void logVisionFail(image, verdict);
            // Для трубных заглушек форма надёжно определяет семейство, но не размер.
            // Не называем это ошибкой распознавания: предлагаем правильный размерный ряд.
            if (
              category === "Заглушки внутренние" &&
              /квадрат|прямоуг|кругл|square|rect|round|circle/i.test(verdict.shape)
            ) {
              return Response.json({
                scenario: "exact",
                verdict,
                category,
                variants: classVariants(verdict).map(brief),
              });
            }
            return Response.json({
              scenario: "notfound",
              verdict,
              matches: matchProducts(verdict, 3).map(brief),
            });
          }


          // «Посторонний объект» — только явный вердикт модели (лица, документы, чужие вещи).
          if (verdict.status === "FOREIGN") {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "foreign", verdict });
          }

          if (!category) {
            void logVisionFail(image, verdict);
            return Response.json({
              scenario: "notfound",
              verdict,
              matches: matchProducts(verdict, 3).map(brief),
            });
          }

          // Валидный SKU из каталога — показываем его семейство даже при осторожной
          // самооценке модели. Размер по фото всё равно выбирает человек.
          if (verdict.sku && score >= 0.4) {
            // Масштаб по фото не определяется: отдаём класс и весь размерный ряд.
            return Response.json({
              scenario: "exact",
              verdict,
              category,
              variants: classVariants(verdict).map(brief),
            });
          }

          if (
            score >= 0.85 &&
            category === "Заглушки внутренние" &&
            /квадрат|прямоуг|кругл|square|rect|round|circle/i.test(verdict.shape)
          ) {
            return Response.json({
              scenario: "exact",
              verdict,
              category,
              variants: classVariants(verdict).map(brief),
            });
          }

          if (score >= 0.5) {

            const matches = matchProducts(verdict, 3).map(brief);
            const reinforced = matches.some((m) => /металл|усиленн/i.test(m.name));
            return Response.json({
              scenario: "ambiguous",
              verdict,
              question: reinforced
                ? "Вам требуется цельнопластиковый вариант или усиленный металлическим каркасом?"
                : `Найдено ${matches.length} похожих варианта. Уточните, какой именно нужен:`,
              matches,
            });
          }

          // < 0.5 — точного совпадения нет: предлагаем близкие категории для ручного выбора.
          void logVisionFail(image, verdict);
          return Response.json({
            scenario: "clarify",
            verdict,
            question:
              "Деталь распознана неточно. Уточните категорию — артикул подберём после вашего выбора:",
            groups: candidateCategories(verdict, 3).map((g) => ({
              category: g.category,
              items: g.items.map(brief),
            })),
          });

        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка распознавания";
          console.error("[vision]", message);
          // Мягкая деградация вместо 503: модалка не гаснет, клиент выбирает
          // категорию вручную в один клик по популярным группам каталога.
          try {
            const { candidateCategories } = await import("@/lib/vision.server");
            const verdict = {
              status: "NOT_FOUND" as const,
              type: "",
              shape: "",
              color: "",
              has_threads: false,
              confidence: 0,
              observed: "",
              hands_present: false,
              low_light: false,
              markers: [],
              detected_features: "",
              sku: null,
              multiple_objects_detected: false,
            };
            return Response.json({
              scenario: "clarify",
              verdict,
              degraded: true,
              question:
                "ИИ-распознавание временно недоступно. Выберите категорию — покажем подходящие позиции каталога:",
              groups: candidateCategories(verdict, 4).map((g) => ({
                category: g.category,
                items: g.items.map((p) => ({
                  sku: p.sku,
                  name: p.name,
                  dims: p.dims,
                  price: p.price,
                  stock: p.stock.qty,
                  lead: p.stock.lead ?? null,
                })),
              })),
            });
          } catch {
            return Response.json({ error: message, fallback: true }, { status: 503 });
          }
        }

      },
    },
  },
});
