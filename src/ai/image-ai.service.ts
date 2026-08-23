import type { Env } from "../config/env";
import type { ImageAnalysisResult } from "./ai.types";
import { asNumber, asString, isRecord } from "../utils/json";

const LEGACY_META_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const DEFAULT_VISION_MODEL = "@cf/moondream/moondream3.1-9B-A2B";

function arrayBufferToBase64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < data.length; index += chunk) {
    binary += String.fromCharCode(...data.subarray(index, Math.min(index + chunk, data.length)));
  }
  return btoa(binary);
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  const direct = asString(value.answer) || asString(value.response) || asString(value.result) || asString(value.text);
  if (direct) return direct;
  if (Array.isArray(value.choices)) {
    const first = value.choices[0];
    if (isRecord(first) && isRecord(first.message)) return asString(first.message.content);
  }
  return "";
}

function resolveVisionModel(env: Env): string {
  const configured = env.AI_VISION_MODEL?.trim();
  // The old reusable install template pointed at Llama 3.2 Vision, which needs
  // a per-account Meta license bootstrap before first use. Existing installs
  // should not silently keep falling back just because they retained that old
  // default, so upgrade that exact legacy value to the OCR-focused model.
  if (!configured || configured === LEGACY_META_VISION_MODEL) return DEFAULT_VISION_MODEL;
  return configured;
}

function promptForSlipExtraction(): string {
  return [
    "Inspect this image for a Thai LINE sales CRM.",
    "Return exactly one JSON object and no markdown.",
    "Use keys image_type, summary, slip_amount, slip_bank, confidence.",
    "image_type must be payment_slip, product_image, other_image, or unknown.",
    "If this is a Thai bank transfer/payment slip, classify it as payment_slip.",
    "Read the actual transferred amount printed on the slip as slip_amount, using a JSON number.",
    "Read the bank name as slip_bank only when visible.",
    "summary must be concise Thai.",
    "confidence must be a number from 0 to 1.",
    "Do not guess unreadable fields and do not treat QR payload data, account numbers, transaction IDs, or dates as the payment amount.",
  ].join(" ");
}

async function runVisionModel(env: Env, model: string, dataUri: string): Promise<unknown> {
  const question = promptForSlipExtraction();

  if (model === DEFAULT_VISION_MODEL) {
    // Moondream 3.1 native Workers AI contract. It is optimized for OCR and
    // structured visual queries and returns the query result in `answer`.
    return env.AI!.run(model, {
      task: "query",
      image: dataUri,
      question,
      reasoning: false,
      stream: false,
      temperature: 0.1,
      max_tokens: 500,
    });
  }

  // Keep an explicit custom-model lane for installations that intentionally
  // select another compatible multimodal text-generation model.
  return env.AI!.run(model, {
    messages: [
      { role: "system", content: "You extract payment-slip facts accurately and return strict JSON." },
      { role: "user", content: question },
    ],
    image: dataUri,
    max_tokens: 500,
    temperature: 0.1,
  });
}

export async function analyzeImage(env: Env, bytes: ArrayBuffer, mimeType: string): Promise<ImageAnalysisResult> {
  if (!env.AI) return { image_type: "unknown", summary: "ลูกค้าส่งรูปภาพ", confidence: 0 };
  const model = resolveVisionModel(env);
  try {
    const dataUri = `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
    const output = await runVisionModel(env, model, dataUri);
    const text = extractText(output).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Vision model returned no JSON object");
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!isRecord(parsed)) throw new Error("Vision JSON is not an object");
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
      confidence: Math.max(0, Math.min(1, asNumber(parsed.confidence, 0.7))),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("AI_IMAGE_FALLBACK", JSON.stringify({
      stage: "vision_inference_or_parse",
      model,
      error: message.slice(0, 240),
    }));
    return { image_type: "unknown", summary: "ลูกค้าส่งรูปภาพ", confidence: 0 };
  }
}
