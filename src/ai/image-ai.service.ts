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
    const prompt = [
      "Analyze this image for a Thai LINE sales CRM.",
      "Return one JSON object only, with no markdown.",
      "Fields: image_type payment_slip|product_image|other_image|unknown; summary Thai; slip_amount number only when visibly readable; slip_bank string only when visibly readable; confidence 0-1.",
      "For a Thai bank transfer/payment slip, classify image_type as payment_slip and carefully read the transferred amount shown on the slip.",
      "Do not guess unreadable payment data and do not treat QR payload text as the transferred amount.",
    ].join(" ");

    // Workers AI native vision contract: the image is a top-level input. Do not
    // use OpenAI-style image_url blocks here; that shape can be accepted by an
    // OpenAI-compatible endpoint but is not the binding contract for this model.
    const output = await env.AI.run(model, {
      messages: [
        { role: "system", content: "You extract payment-slip facts accurately and return strict JSON." },
        { role: "user", content: prompt },
      ],
      image: dataUri,
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
    console.warn("AI_IMAGE_FALLBACK", error instanceof Error ? error.message : String(error));
    return { image_type: "unknown", summary: "ลูกค้าส่งรูปภาพ", confidence: 0 };
  }
}
