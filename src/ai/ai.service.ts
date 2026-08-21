import type { Env } from "../config/env";
import { isRecord, asString, asNumber, asBoolean } from "../utils/json";
import type { AIAnalysisResult, ActionIntent, BuyerIntent, CustomerStage } from "./ai.types";
import { analyzeByRules } from "./rule-engine";

const intents = new Set<ActionIntent>(["greeting","general_inquiry","ask_price","ask_discount","product_info","product_order","payment_request","payment_slip","delivery_address","delivery_question","lost","support","small_talk","image_received","unknown"]);
const buyers = new Set<BuyerIntent>(["Just Browsing","Interested","Purchase Intent","Ready To Buy"]);
const stages = new Set<CustomerStage>(["New Lead","Interested","Negotiating","Closing","Won","Lost"]);

function extractModelText(value: unknown): string {
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

function parseJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function analyzeIncomingText(env: Env, text: string): Promise<AIAnalysisResult> {
  const fallback = analyzeByRules(text);
  if (!env.AI) return fallback;
  try {
    const model = env.AI_TEXT_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct-fast";
    const output = await env.AI.run(model, {
      messages: [
        { role: "system", content: "You classify LINE sales-chat messages. Return JSON only with intent, buyer_intent, customer_stage, lead_score (0-100), hot_lead, ai_summary, confidence (0-1). intent must be one of greeting,general_inquiry,ask_price,ask_discount,product_info,product_order,payment_request,payment_slip,delivery_address,delivery_question,lost,support,small_talk,image_received,unknown. buyer_intent must be Just Browsing, Interested, Purchase Intent, or Ready To Buy. customer_stage must be New Lead, Interested, Negotiating, Closing, Won, or Lost. Preserve Thai meaning and never invent price/payment facts." },
        { role: "user", content: text.slice(0, 4000) },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });
    const parsed = parseJsonObject(extractModelText(output));
    if (!parsed) return fallback;
    const intent = asString(parsed.intent) as ActionIntent;
    const buyer = asString(parsed.buyer_intent) as BuyerIntent;
    const stage = asString(parsed.customer_stage) as CustomerStage;
    if (!intents.has(intent) || !buyers.has(buyer) || !stages.has(stage)) return fallback;
    const score = Math.max(0, Math.min(100, asNumber(parsed.lead_score, fallback.lead_score)));
    return {
      intent,
      buyer_intent: buyer,
      customer_stage: stage,
      lead_score: score,
      hot_lead: asBoolean(parsed.hot_lead, score >= 80),
      ai_summary: asString(parsed.ai_summary).trim().slice(0, 500) || fallback.ai_summary,
      provider: "workers_ai",
      confidence: Math.max(0, Math.min(1, asNumber(parsed.confidence, 0.75))),
    };
  } catch (error) {
    console.warn("AI_TEXT_FALLBACK", error instanceof Error ? error.message : String(error));
    return fallback;
  }
}
