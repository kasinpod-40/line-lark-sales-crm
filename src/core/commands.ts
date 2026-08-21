import { parseMoney } from "../utils/money";

export type SalesCommand =
  | { type: "close_deal"; amount: number }
  | { type: "campaign"; segment: "vip" | "retarget" }
  | { type: "none" };

export function parseSalesCommand(text: string): SalesCommand {
  const normalized = text.trim().toLowerCase();
  const closeMatch = normalized.match(/^ปิดยอด\s*([฿\d,.]+)\s*$/u);
  if (closeMatch?.[1]) {
    const amount = parseMoney(closeMatch[1], -1);
    if (amount > 0) return { type: "close_deal", amount };
  }
  if (/^ยิงโปร\s*vip\s*$/iu.test(normalized)) return { type: "campaign", segment: "vip" };
  if (/^ยิงโปร\s*(retarget|รีทาร์เก็ต|รีทาเก็ต)\s*$/iu.test(normalized)) return { type: "campaign", segment: "retarget" };
  return { type: "none" };
}
