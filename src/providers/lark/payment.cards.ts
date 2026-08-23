import { formatMoney } from "../../utils/money";

type CardHeaderTemplate = "green" | "grey" | "orange" | "purple";
type CardButtonType = "default" | "primary_filled" | "danger";

function md(content: string): unknown {
  return { tag: "markdown", content };
}

function callback(value: Record<string, string>): unknown {
  return { type: "callback", value };
}

function button(label: string, value: Record<string, string>, type: CardButtonType = "default"): unknown {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    width: "fill",
    behaviors: [callback(value)],
  };
}

function submitButton(label: string, name: string, value: Record<string, string>): unknown {
  return {
    ...button(label, value, "primary_filled") as Record<string, unknown>,
    name,
    form_action_type: "submit",
  };
}

function input(name: string, placeholder: string, defaultValue = ""): unknown {
  const field: Record<string, unknown> = {
    tag: "input",
    name,
    required: false,
    width: "fill",
    input_type: "text",
    placeholder: { tag: "plain_text", content: placeholder },
  };
  if (defaultValue) field.default_value = defaultValue;
  return field;
}

function twoColumns(left: unknown, right: unknown): unknown {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "top",
        elements: [left],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "top",
        elements: [right],
      },
    ],
  };
}

function card(
  template: CardHeaderTemplate,
  title: string,
  elements: unknown[],
  summary: string,
  updateMulti = true,
): unknown {
  return {
    schema: "2.0",
    config: {
      update_multi: updateMulti,
      width_mode: "fill",
      summary: { content: summary.slice(0, 200) },
    },
    header: {
      template,
      title: { tag: "plain_text", content: title },
    },
    body: { elements },
  };
}

export function buildPaymentSinglePreviewCard(
  caseId: string,
  draftId: string,
  amount: number,
  note?: string,
): unknown {
  return card(
    "orange",
    "ตรวจสอบยอดชำระ",
    [
      md(`ยอดที่จะสร้าง PromptPay QR: **฿${formatMoney(amount)}**${note ? `\n${note}` : ""}`),
      button(
        "✅ ยืนยันสร้าง + ส่ง LINE",
        { action: "confirm_qr_single_card", case_id: caseId, draft_id: draftId },
        "primary_filled",
      ),
      twoColumns(
        button("✏️ แก้ไขยอดเงิน", { action: "edit_qr_amount", case_id: caseId, draft_id: draftId }),
        button("❌ ยกเลิก", { action: "cancel_qr_single_card", case_id: caseId, draft_id: draftId }, "danger"),
      ),
    ],
    `ตรวจสอบยอด PromptPay ฿${formatMoney(amount)}`,
  );
}

export function buildPaymentEditCard(
  caseId: string,
  draftId: string,
  amount: number,
  note?: string,
): unknown {
  return card(
    "purple",
    "✏️ แก้ไขยอดชำระ",
    [
      {
        tag: "form",
        name: "payment_edit_form",
        elements: [
          md("**ยอดชำระ (บาท)**"),
          input("amount", "ยอดชำระ", String(amount)),
          md("**รายละเอียด/หมายเหตุ**"),
          input("note", "รายละเอียด/หมายเหตุ", note ?? ""),
          submitButton(
            "💾 บันทึกยอดเงิน",
            "save_qr_amount",
            { action: "save_qr_amount", case_id: caseId, draft_id: draftId },
          ),
          button("↩️ กลับโดยไม่แก้ไข", { action: "cancel_qr_edit", case_id: caseId, draft_id: draftId }),
        ],
      },
    ],
    `แก้ไขยอด PromptPay ฿${formatMoney(amount)}`,
  );
}

export function buildPaymentSentCard(amount: number): unknown {
  return card(
    "green",
    "✅ ส่ง QR ชำระเงินแล้ว",
    [md(`สร้าง PromptPay QR และส่งเข้า LINE สำเร็จแล้ว\n**ยอดชำระ ฿${formatMoney(amount)}**\nการ์ดนี้สิ้นสุดแล้ว ไม่มี action ที่ต้องดำเนินการต่อ`) ],
    `ส่ง PromptPay QR ฿${formatMoney(amount)} แล้ว`,
    false,
  );
}

export function buildPaymentCancelledCard(): unknown {
  return card(
    "grey",
    "⚪ QR ชำระเงิน — ยกเลิกแล้ว",
    [md("รายการ QR ชำระเงินนี้ถูกยกเลิกแล้ว\nไม่มีการส่ง LINE และไม่มี action ที่ใช้งานได้ต่อจากการ์ดนี้")],
    "QR ชำระเงินยกเลิกแล้ว",
    false,
  );
}
