import { parseMoney } from "../utils/money";

export type SalesCommand =
  | { type: "close_deal"; amount: number; source: "explicit" }
  | { type: "close_amount_candidate"; amount: number }
  | { type: "campaign"; segment: "vip" | "retarget" }
  | { type: "campaign_menu" }
  | { type: "none" };

function positiveAmount(raw: string): number | null {
  const amount = parseMoney(raw, -1);
  return amount > 0 ? amount : null;
}

export function parseSalesCommand(text: string): SalesCommand {
  const normalized = text.trim().toLowerCase();
  const closeMatch = normalized.match(/^(?:ปิดยอด|ยอดเงิน)\s*([฿\d,.]+)\s*$/u);
  if (closeMatch?.[1]) {
    const amount = positiveAmount(closeMatch[1]);
    if (amount) return { type: "close_deal", amount, source: "explicit" };
  }

  const bareMatch = normalized.match(/^([฿\d][฿\d,.]*)$/u);
  if (bareMatch?.[1]) {
    const amount = positiveAmount(bareMatch[1]);
    if (amount) return { type: "close_amount_candidate", amount };
  }

  if (/^(?:ยิงโปร|บรอดแคสต์)\s*vip\s*$/iu.test(normalized)) return { type: "campaign", segment: "vip" };
  if (/^(?:ยิงโปร|บรอดแคสต์)\s*(retarget|รีทาร์เก็ต|รีทาเก็ต)\s*$/iu.test(normalized)) return { type: "campaign", segment: "retarget" };
  if (/^บรอดแคสต์\s*$/iu.test(normalized)) return { type: "campaign_menu" };
  return { type: "none" };
}
