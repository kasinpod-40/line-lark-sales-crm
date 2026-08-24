export type PromptPayTargetType = "phone" | "national_id" | "ewallet";

function field(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) return `00${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `0066${digits.slice(1)}`;
  throw new Error("PromptPay phone must be a Thai 10-digit mobile number");
}

function normalizeTarget(value: string, type: PromptPayTargetType): { tag: string; value: string } {
  const digits = value.replace(/\D/g, "");
  if (type === "phone") return { tag: "01", value: normalizePhone(value) };
  if (type === "national_id") {
    if (digits.length !== 13) throw new Error("PromptPay national ID / tax ID must be 13 digits");
    return { tag: "02", value: digits };
  }
  if (!digits) throw new Error("PromptPay e-wallet ID is required");
  return { tag: "03", value: digits };
}

export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPromptPayPayload(target: string, amount: number, type: PromptPayTargetType = "phone"): string {
  if (!(amount > 0) || !Number.isFinite(amount)) throw new Error("PromptPay amount must be greater than 0");
  const normalized = normalizeTarget(target, type);
  const merchantAccount = field("00", "A000000677010111") + field(normalized.tag, normalized.value);
  const payloadWithoutCrc = [
    field("00", "01"),
    field("01", "12"),
    field("29", merchantAccount),
    field("53", "764"),
    field("54", amount.toFixed(2)),
    field("58", "TH"),
    "6304",
  ].join("");
  return payloadWithoutCrc + crc16CcittFalse(payloadWithoutCrc);
}
