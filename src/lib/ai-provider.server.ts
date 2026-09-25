/**
 * Единая точка выхода во внешние LLM (паттерн Strategy).
 *
 * Зачем: на боевом VDS прямые домены OpenAI/Google недоступны — обращаемся
 * только через собственный OpenAI-совместимый шлюз. Платформенных ключей и
 * фолбэков в коде нет.
 * Поэтому и провайдер, и точка входа (Base URL), и имя модели задаются
 * переменными окружения, а код вызова остаётся один.
 *
 * Переменные (.env):
 *   AI_PROVIDER              = openai | gemini                 (общий режим)
 *   AI_PROVIDER_VISION       = ...                            (переопределение для ИИ-камеры)
 *   AI_PROVIDER_CONFIGURATOR = ...                            (переопределение для конфигуратора)
 *
 *   OPENAI_API_KEY    / OPENAI_BASE_URL    / OPENAI_MODEL     / OPENAI_VISION_MODEL
 *   GEMINI_API_KEY    / GEMINI_BASE_URL    / GEMINI_MODEL     / GEMINI_VISION_MODEL
 *
 * Ключи читаются через vault: сначала зашифрованное хранилище админки
 * (AES-256-GCM), затем переменная окружения. Хардкод ключей запрещён.
 */
import { secretValue } from "@/lib/vault.server";

export type AiTask = "vision" | "configurator";
export type AiProviderId = "openai" | "gemini";

export type AiUsage = { prompt_tokens: number; completion_tokens: number };

export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = { type: "image_url"; image_url: { url: string } };
export type AiContent = string | Array<AiTextPart | AiImagePart>;

export type AiJsonSchema = { name: string; schema: unknown };

export type AiRequest = {
  task: AiTask;
  system: string;
  content: AiContent;
  /** Строгий JSON-ответ по схеме (конфигуратор). */
  jsonSchema?: AiJsonSchema;
  /** Принудительный JSON-ответ без схемы (vision: {found, status, ...}). */
  jsonObject?: boolean;
  /** Детерминированность: 0 для классификаторов, undefined — дефолт провайдера. */
  temperature?: number;
  timeoutMs?: number;
  /** Потолок ответа: короткий JSON классификатора не должен превращаться в эссе. */
  maxTokens?: number;
};

export type AiResponse = { text: string; usage: AiUsage; model: string; provider: AiProviderId };

/** Ключи не заданы / шлюз не сконфигурирован — фронтенд уходит в ручной режим. */
export class AiUnavailableError extends Error {
  readonly fallback = true;
  constructor(message = "Сервис временно недоступен") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Провайдер ответил ошибкой (лимиты, 4xx/5xx) — сообщение уже человеческое. */
export class AiGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** true — задачу можно увести в ручной режим, а не показывать код ошибки. */
    readonly fallback = true,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

const DEFAULTS = {
  openai: {
    // Рег.облако (Reg.ru Cloud AI) — OpenAI-совместимый шлюз.
    // Пустое значение намеренно: resolveAi требует OPENAI_BASE_URL и никогда
    // не использует прямой адрес OpenAI.
    baseUrl: "",
    model: "deepseek-v4-flash",
    visionModel: "gemini-3.5-flash",
  },
  gemini: {
    // OpenAI-совместимый эндпоинт Google: тело запроса не меняется.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    visionModel: "gemini-2.0-flash",
  },
} as const;

const env = (name: string) => process.env[name]?.trim() || null;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

function providerFor(task: AiTask): AiProviderId {
  const explicit =
    env(task === "vision" ? "AI_PROVIDER_VISION" : "AI_PROVIDER_CONFIGURATOR") ?? env("AI_PROVIDER");
  // Единственный режим по умолчанию — собственный OpenAI-совместимый шлюз
  // (OPENAI_BASE_URL + OPENAI_API_KEY). Платформенных фолбэков нет.
  const raw = (explicit ?? "openai").toLowerCase();
  return raw === "gemini" ? "gemini" : "openai";
}

type Resolved = {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** Единая резолюция «провайдер + ключ + точка входа + модель» для задачи. */
export async function resolveAi(task: AiTask): Promise<Resolved> {
  const provider = providerFor(task);
  const d = DEFAULTS[provider];
  const isVision = task === "vision";

  if (provider === "openai") {
    const apiKey = await secretValue("OPENAI_API_KEY");
    const baseUrl = env("OPENAI_BASE_URL");
    // Прямой fallback к провайдеру запрещён: с российского VPS он отвечает
    // unsupported_country_region_territory. Оба AI-сценария
    // (конфигуратор и сканер) обязаны идти через настроенный шлюз.
    if (!apiKey || !baseUrl) throw new AiUnavailableError();
    return {
      provider,
      apiKey,
      baseUrl: trimSlash(baseUrl),
      model: (isVision ? env("OPENAI_VISION_MODEL") : null) ?? env("OPENAI_MODEL") ??
        (isVision ? d.visionModel : d.model),
    };
  }

  if (provider === "gemini") {
    const apiKey = await secretValue("GEMINI_API_KEY");
    if (!apiKey) throw new AiUnavailableError();
    return {
      provider,
      apiKey,
      baseUrl: trimSlash(env("GEMINI_BASE_URL") ?? d.baseUrl),
      model: (isVision ? env("GEMINI_VISION_MODEL") : null) ?? env("GEMINI_MODEL") ??
        (isVision ? d.visionModel : d.model),
    };
  }

  // Недостижимо: providerFor возвращает только openai | gemini.
  throw new AiUnavailableError();
}

/** Быстрая проверка для UI: сконфигурирован ли ИИ вообще. */
export async function aiConfigured(task: AiTask): Promise<boolean> {
  try {
    await resolveAi(task);
    return true;
  } catch {
    return false;
  }
}

function authHeaders(r: Resolved): Record<string, string> {
  // OpenAI и OpenAI-совместимые шлюзы (в т.ч. российские прокси и Gemini-compat).
  return { Authorization: `Bearer ${r.apiKey}` };
}

/** Человеческие сообщения вместо кодов ошибок провайдера. */
function gatewayError(status: number, task: AiTask, detail = ""): AiGatewayError {
  const what = task === "vision" ? "распознавания" : "конфигуратора";
  // Шлюз отвечает 401 и при пустом балансе — это не «неверный ключ».
  if (/insufficient_balance|пополните баланс/i.test(detail))
    return new AiGatewayError(
      "ИИ-сервис временно недоступен: на счёте ИИ-шлюза закончился баланс.",
      402,
    );
  if (status === 429)
    return new AiGatewayError("Слишком много запросов к ИИ. Повторите через минуту.", status);
  if (status === 402 || status === 403)
    return new AiGatewayError("Лимит ИИ-запросов исчерпан. Обратитесь к менеджеру.", status);
  if (status === 401) {
    // Ключ шлюза истёк или отозван — это настройка, а не сбой сети.
    const expired = /expired/i.test(detail);
    return new AiGatewayError(
      expired
        ? "Ключ доступа к ИИ-шлюзу истёк. Обновите OPENAI_API_KEY в настройках."
        : "Ключ доступа к ИИ-шлюзу неверен. Проверьте OPENAI_API_KEY и OPENAI_BASE_URL.",
      status,
    );
  }
  return new AiGatewayError(`Сервис ${what} временно недоступен`, status);
}


async function postJson(
  r: Resolved,
  path: string,
  body: unknown,
  timeoutMs: number,
  task: AiTask,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${r.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(r) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AiGatewayError(
        "Анализ занимает слишком много времени. Упростите запрос или обратитесь к менеджеру.",
        504,
      );
    }
    // Сеть/DNS: типовая история для VPS в РФ без корректного шлюза.
    console.error(`[ai:${r.provider}] network error`, e);
    throw new AiUnavailableError();
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai:${r.provider}] ${path} ${res.status}: ${detail.slice(0, 500)}`);
    throw gatewayError(res.status, task, detail);
  }
  return res;
}

/* ── Стратегия 1: OpenAI-совместимый /chat/completions ─────────────── */

async function chatCompletions(r: Resolved, req: AiRequest): Promise<AiResponse> {
  const body: Record<string, unknown> = {
    model: r.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.content },
    ],
  };
  if (req.jsonSchema) {
    body["response_format"] = {
      type: "json_schema",
      json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema },
    };
  } else if (req.jsonObject) {
    body["response_format"] = { type: "json_object" };
  }
  if (typeof req.temperature === "number") {
    body["temperature"] = req.temperature;
  }
  if (typeof req.maxTokens === "number") {
    body["max_tokens"] = req.maxTokens;
  }

  const res = await postJson(r, "/chat/completions", body, req.timeoutMs ?? 20_000, req.task);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: (json.choices?.[0]?.message?.content ?? "").trim(),
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      completion_tokens: json.usage?.completion_tokens ?? 0,
    },
    model: r.model,
    provider: r.provider,
  };
}

/* ── Публичный вызов ───────────────────────────────────────────────── */

/**
 * Единственный способ обратиться к LLM из бизнес-кода.
 * Бросает AiUnavailableError (ключей нет) или AiGatewayError (провайдер ответил ошибкой).
 */
export async function aiComplete(req: AiRequest): Promise<AiResponse> {
  const r = await resolveAi(req.task);
  // Все вызовы идут единым OpenAI-совместимым протоколом /chat/completions.
  return chatCompletions(r, req);
}
