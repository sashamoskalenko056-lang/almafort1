import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  sku: z.string().min(1).max(40),
  predicted: z.string().max(40).nullable(),
  features: z.string().min(3).max(200),
});

/** «Да, это она»: посетитель подтвердил артикул — пополняем память сканера. */
export const Route = createFileRoute("/api/vision/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rateLimit } = await import("@/lib/rate-limit.server");
        const limited = rateLimit(request, "vision-feedback", { limit: 20, windowMs: 60_000 });
        if (limited) return limited;
        let body: z.infer<typeof schema>;
        try {
          body = schema.parse(await request.json());
        } catch {
          return Response.json({ error: "Некорректные данные" }, { status: 400 });
        }
        const { PRODUCTS } = await import("@/data/catalog");
        if (!PRODUCTS.some((p) => p.sku === body.sku)) {
          return Response.json({ error: "Неизвестный артикул" }, { status: 400 });
        }
        const { saveVisionFeedback } = await import("@/lib/vision.server");
        await saveVisionFeedback(body);
        return Response.json({ ok: true });
      },
    },
  },
});
