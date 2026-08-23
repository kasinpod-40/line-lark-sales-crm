import type { Env } from "../config/env";
import type { ImageAnalysisResult } from "./ai.types";
import { asNumber, asString, isRecord } from "../utils/json";

const LEGACY_GEMINI_IMAGE_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.7-flash";
const FALLBACK_GEMINI_IMAGE_MODEL = "gemini-3.6-flash";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 502, 503, 504]);

const IMAGE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    image_type: {
      type: "string",
      enum: ["payment_slip", "product_image", "other_image", "unknown"],
    },
    summary: { type: "string" },
    slip_amount: { type: "number", minimum: 0 },
    slip_bank: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["image_type", "summary", "slip_amount", "slip_bank", "confidence"],
  additionalProperties: false,
  propertyOrdering: ["image_type", "summary", "slip_amount", "slip_bank", "confidence"],
} as const;

const IMAGE_AI_PROMPT = [
  "คุณคือ AI Vision สำหรับ LINE Sales CRM ในประเทศไทย",
  "วิเคราะห์เฉพาะรูปที่ได้รับและตอบ JSON เท่านั้น ห้ามใส่ Markdown หรือข้อความนอก JSON",
  "ถ้าเป็นสลิปโอนเงินหรือหน้าจอชำระเงินสำเร็จอย่างชัดเจน ให้ image_type=payment_slip",
  "ถ้าอ่านยอดเงินที่โอนจริงได้ ให้ slip_amount เป็นตัวเลขเท่านั้น เช่น 888.00 ให้ตอบ 888",
  "ห้ามใช้เลขบัญชี เลขอ้างอิง วันที่ เวลา หรือข้อมูลใน QR code เป็น slip_amount",
  "ถ้าอ่านชื่อธนาคารได้ ให้ใส่ slip_bank ถ้าอ่านไม่ได้ให้เป็นค่าว่าง",
  "ถ้าเป็นรูปสินค้าให้ image_type=product_image ถ้าเป็นรูปทั่วไปให้ other_image และถ้าไม่แน่ใจให้ unknown",
  "summary ต้องเป็นภาษาไทยสั้นและบอกเฉพาะสิ่งที่เห็นจริง",
  "confidence ต้องอยู่ระหว่าง 0 ถึง 1 และห้ามเดาข้อมูลที่อ่านไม่ชัด",
].join("\n\n");

function arrayBufferToBase64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < data.length; index += chunk) {
    binary += String.fromCharCode(...data.subarray(index, Math.min(index + chunk, data.length)));
  }
  return btoa(binary);
}

function resolveGeminiImageModel(env: Env): string {
  const configured = env.GEMINI_IMAGE_MODEL?.trim();
  if (!configured || configured === LEGACY_GEMINI_IMAGE_MODEL) return DEFAULT_GEMINI_IMAGE_MODEL;
  return configured;
}

function extractGeminiText(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return "";
  const first = value.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) return "";

  const answerTexts: string[] = [];
  const fallbackTexts: string[] = [];
  for (const part of first.content.parts) {
    if (!isRecord(part)) continue;
    const text = asString(part.text).trim();
    if (!text) continue;
    fallbackTexts.push(text);
    if (part.thought !== true) answerTexts.push(text);
  }
  const texts = answerTexts.length > 0 ? answerTexts : fallbackTexts;
  return texts.at(-1)?.trim() || "";
}

function extractFinishReason(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return "unknown";
  const first = value.candidates[0];
  return isRecord(first) ? asString(first.finishReason) || "unknown" : "unknown";
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").replace(/^\uFEFF/, "").trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (isRecord(parsed)) return parsed;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
      if (isRecord(parsed)) return parsed;
    }
  }
  throw new Error(`Gemini image response is not valid JSON: ${cleaned.replace(/\s+/g, " ").slice(0, 240) || "<empty>"}`);
}

function safeFallback(reason: string): ImageAnalysisResult {
  console.warn("AI_IMAGE_FALLBACK", JSON.stringify({
    provider: "gemini",
    stage: "vision_inference_or_parse",
    error: reason.slice(0, 240),
  }));
  return {
    image_type: "unknown",
    summary: "ลูกค้าส่งรูปภาพ แต่ระบบยังวิเคราะห์รูปไม่ได้",
    confidence: 0,
    provider: "safe_fallback",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(modelIndex: number, attempt: number): number {
  if (modelIndex === 0 && attempt === 1) return 400;
  if (modelIndex === 1 && attempt === 0) return 700;
  return 1200;
}

function hasAnotherAttempt(modelIndex: number, attempt: number, modelCount: number): boolean {
  return attempt === 0 || modelIndex + 1 < modelCount;
}

export async function analyzeImage(env: Env, bytes: ArrayBuffer, mimeType: string): Promise<ImageAnalysisResult> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return safeFallback("GEMINI_API_KEY is not configured");

  const normalizedMime = mimeType.split(";")[0]?.trim() || "image/jpeg";
  if (!normalizedMime.startsWith("image/")) return safeFallback(`Unsupported image content type: ${normalizedMime}`);
  if (bytes.byteLength === 0) return safeFallback("Image is empty");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return safeFallback(`Image is too large for Gemini analysis: ${bytes.byteLength} bytes`);

  const primaryModel = resolveGeminiImageModel(env);
  const models = primaryModel === FALLBACK_GEMINI_IMAGE_MODEL
    ? [primaryModel]
    : [primaryModel, FALLBACK_GEMINI_IMAGE_MODEL];
  const encodedImage = arrayBufferToBase64(bytes);
  let successfulBody: unknown | null = null;
  let lastError = "Gemini image analysis failed without a response";

  outer: for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]!;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const delayMs = retryDelayMs(modelIndex, attempt);
      if (modelIndex > 0 || attempt > 0) await sleep(delayMs);

      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: IMAGE_AI_PROMPT },
                  {
                    inlineData: {
                      mimeType: normalizedMime,
                      data: encodedImage,
                    },
                  },
                ],
              }],
              generationConfig: {
                maxOutputTokens: 768,
                thinkingConfig: { thinkingLevel: "low" },
                responseMimeType: "application/json",
                responseJsonSchema: IMAGE_ANALYSIS_JSON_SCHEMA,
              },
            }),
          },
        );
      } catch (error) {
        lastError = `Gemini network error: ${error instanceof Error ? error.message : String(error)}`;
        if (hasAnotherAttempt(modelIndex, attempt, models.length)) {
          console.warn("AI_IMAGE_RETRY", JSON.stringify({
            provider: "gemini",
            model,
            status: "network",
            attempt: attempt + 1,
          }));
          continue;
        }
        break outer;
      }

      const bodyText = await response.text();
      let body: unknown = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        body = { raw: bodyText.slice(0, 500) };
      }

      if (response.ok) {
        successfulBody = body;
        break outer;
      }

      lastError = `Gemini HTTP ${response.status}: ${JSON.stringify(body).slice(0, 400)}`;
      if (RETRYABLE_GEMINI_STATUSES.has(response.status) && hasAnotherAttempt(modelIndex, attempt, models.length)) {
        console.warn("AI_IMAGE_RETRY", JSON.stringify({
          provider: "gemini",
          model,
          status: response.status,
          attempt: attempt + 1,
        }));
        continue;
      }
      break outer;
    }
  }

  if (successfulBody === null) return safeFallback(lastError);

  const raw = extractGeminiText(successfulBody);
  if (!raw) return safeFallback(`Gemini returned empty response (finishReason=${extractFinishReason(successfulBody)})`);

  try {
    const parsed = parseJsonObject(raw);
    const rawType = asString(parsed.image_type);
    const imageType: ImageAnalysisResult["image_type"] = ["payment_slip", "product_image", "other_image", "unknown"].includes(rawType)
      ? rawType as ImageAnalysisResult["image_type"]
      : "unknown";
    const amount = asNumber(parsed.slip_amount, -1);
    return {
      image_type: imageType,
      summary: asString(parsed.summary).trim().slice(0, 500) || "ลูกค้าส่งรูปภาพ",
      slip_amount: imageType === "payment_slip" && amount >= 0 ? amount : undefined,
      slip_bank: imageType === "payment_slip" ? asString(parsed.slip_bank).trim() || undefined : undefined,
      confidence: Math.max(0, Math.min(1, asNumber(parsed.confidence, 0))),
      provider: "gemini",
    };
  } catch (error) {
    return safeFallback(error instanceof Error ? error.message : String(error));
  }
}
