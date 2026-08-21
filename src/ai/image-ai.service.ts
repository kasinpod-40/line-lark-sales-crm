import type { Env } from "../config/env";
import type { ImageAnalysisResult } from "./ai.types";
import { asNumber, asString, isRecord } from "../utils/json";

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
  const direct = asString(value.response) || asString(value.result) || asString(value.text);
  if (direct) return direct;
  if (Array.isArray(value.choices)) {
    const first = value.choices[0];
    if (isRecord(first) && isRecord(first.message)) return asString(first.message.content);
  }
  return "";
}

export async function analyzeImage(env: Env, bytes: ArrayBuffer, mimeType: string): Promise<ImageAnalysisResult> {
  if (!env.AI) return { image_type: "unknown", summary: "ลูกค้าส่งรูปภาพ", confidence: 0 };
  try {
    const model = env.AI_VISION_MODEL?.trim() || "@cf/meta/llama-3.2-11b-vision-instruct";
    const dataUri = `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
    const output = await env.AI.run(model, {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Analyze this image for a Thai LINE sales CRM. Return JSON only: image_type payment_slip|product_image|other_image|unknown, summary Thai, slip_amount number if visibly present, slip_bank string if visibly present, confidence 0-1. Do not guess unreadable payment data." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      }],
      max_tokens: 350,
      temperature: 0.1,
    });
    const text = extractText(output).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Vision model returned no JSON object");
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!isRecord(parsed)) throw new Error("Vision JSON is not an object");
    const rawType = asString(parsed.image_type);
    const imageType: ImageAnalysisResult["image_type"] = ["payment_slip","product_image","other_image","unknown"].includes(rawType) ? rawType as ImageAnalysisResult["image_type"] : "unknown";
    const amount = asNumber(parsed.slip_amount, -1);
    return {
      image_type: imageType,
      summary: asString(parsed.summary).trim().slice(0, 500) || "ลูกค้าส่งรูปภาพ",
      slip_amount: imageType === "payment_slip" && amount >= 0 ? amount : undefined,
      slip_bank: imageType === "payment_slip" ? asString(parsed.slip_bank).trim() || undefined : undefined,
      confidence: Math.max(0, Math.min(1, asNumber(parsed.confidence, 0.7))),
    };
  } catch (error) {
    console.warn("AI_IMAGE_FALLBACK", error instanceof Error ? error.message : String(error));
    return { image_type: "unknown", summary: "ลูกค้าส่งรูปภาพ", confidence: 0 };
  }
}
