import { createFileRoute } from "@tanstack/react-router";
import { PRODUCTS } from "@/data/catalog";

type Ext = "step" | "dwg" | "pdf" | "glb" | "sldprt";

/** Понятные имена скачиваемых файлов по артикулу. */
const NICE_NAME: Record<string, string> = {
  "KR-50": "Derzhatel-kolpachka-Karshar-KR-50",
  "OP-H15": "Opora-mebelnaya-h15",
  "OP-H20": "Opora-mebelnaya-h20",
  "OP-H35": "Opora-mebelnaya-h35",
  "OP-H50": "Opora-mebelnaya-h50",
  "ZGV-25x25": "Zaglushka-25x25",
  "ZGV-40x20": "Zaglushka-40x20",
  "ZGV-60x40": "Zaglushka-60x40",
  "ZGV-60x40": "Zaglushka-60x40",
};

const MIME: Record<Ext, string> = {
  step: "model/step",
  dwg: "image/vnd.dwg",
  pdf: "application/pdf",
  glb: "model/gltf-binary",
  sldprt: "application/octet-stream",
};

/** Минимальный валидный PDF — заглушка паспорта, пока в S3 нет боевого файла. */
function stubPdf(title: string) {
  const text = `BT /F1 14 Tf 56 780 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}

function stubStep(sku: string, name: string) {
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ALMAFORT ${sku} — ${name}'),'2;1');
FILE_NAME('ALMAFORT_${sku}.step','${new Date().toISOString()}',('ALMAFORT'),('ALMAFORT'),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=APPLICATION_CONTEXT('mechanical design');
ENDSEC;
END-ISO-10303-21;
`;
}

function stubDwg(sku: string, name: string) {
  return `  0\nSECTION\n  2\nHEADER\n  9\n$PROJECTNAME\n  1\nALMAFORT ${sku} ${name}\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n`;
}

export const Route = createFileRoute("/api/public/cad/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parts = (params._splat ?? "").split("/").filter(Boolean);
        const sku = parts[0] ?? "";
        const ext = (parts[1] ?? "") as Ext;
        if (!sku || !(ext in MIME)) return new Response("Not found", { status: 404 });

        const product = PRODUCTS.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        if (!product) return new Response("Not found", { status: 404 });

        const fileName = `ALMAFORT_${product.sku}_${product.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.${ext}`;

        // Настоящий файл из public/cad/<SKU>.<ext> — приоритет над S3 и заглушками.
        try {
          const { readFile } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const local = await readFile(join(process.cwd(), "public", "cad", `${product.sku}.${ext}`));
          return new Response(new Uint8Array(local), {
            status: 200,
            headers: {
              "Content-Type": MIME[ext],
              "Content-Disposition": `attachment; filename="${NICE_NAME[product.sku] ?? product.sku}.${ext}"`,
              "Cache-Control": "public, max-age=3600",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          /* локального файла нет — идём дальше */
        }

        // Боевой путь: файл лежит в S3 (almafort-cad-assets) с Content-Disposition
        // в метаданных объекта — просто редиректим браузер на объект.
        const bucket = process.env["S3_CAD_BUCKET"] ?? process.env["S3_BUCKET"];
        const endpoint = process.env["S3_ENDPOINT"] ?? "storage.yandexcloud.net";
        if (bucket) {
          return Response.redirect(
            `https://${bucket}.${endpoint}/cad/${product.sku}.${ext}`,
            302,
          );
        }

        // Фолбэк без сконфигурированного S3: отдаём корректно именованную заглушку,
        // чтобы UX скачивания работал уже сейчас.
        if (ext === "glb" || ext === "sldprt") return new Response("Model not uploaded", { status: 404 });
        const body =
          ext === "pdf"
            ? stubPdf(`ALMAFORT ${product.sku} — ${product.name}`)
            : ext === "step"
              ? stubStep(product.sku, product.name)
              : stubDwg(product.sku, product.name);

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": MIME[ext],
            "Content-Disposition": `attachment; filename="ALMAFORT_${product.sku}.${ext}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
