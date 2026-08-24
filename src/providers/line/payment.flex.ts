import type { LineFlexMessage } from "./line.provider";
import { formatMoney } from "../../utils/money";

function text(textValue: string, options: Record<string, unknown> = {}): unknown {
  return { type: "text", text: textValue, wrap: true, ...options };
}

export function paymentQrFlex(company: string, amount: number, qrUrl: string, note?: string): LineFlexMessage {
  return {
    type: "flex",
    altText: `QR ชำระเงิน ฿${formatMoney(amount)}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          text(company, { weight: "bold" }),
          text("ชำระเงิน PromptPay", { weight: "bold", size: "xl" }),
        ],
      },
      hero: {
        type: "image",
        url: qrUrl,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "fit",
        backgroundColor: "#FFFFFF",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          text("ยอดชำระ", { color: "#666666" }),
          text(`฿${formatMoney(amount)}`, { size: "xxl", weight: "bold" }),
          ...(note ? [text(note, { size: "sm" })] : []),
          text("สแกน QR ด้านบนและตรวจสอบชื่อผู้รับกับยอดเงินในแอปธนาคารก่อนยืนยัน", { size: "xs", color: "#777777" }),
        ],
      },
    },
  };
}
