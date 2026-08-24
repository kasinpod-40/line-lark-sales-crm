import type { Env } from "../config/env";
import type { CampaignDraft } from "../core/models";
import { campaignFlex } from "../providers/line/line.flex";
import { LineApiError, multicastLineMessages, pushLineMessages } from "../providers/line/line.provider";
import { LarkClient } from "../providers/lark/lark.client";
import { OperationalRepository } from "../storage/operational.repository";
import { stableUuid } from "../utils/id";

interface CampaignStoredDraft {
  campaign: CampaignDraft;
  recipients: string[];
}

function companyName(env: Env): string {
  return env.COMPANY_NAME?.trim() || "Sales Team";
}

function isSafePermanentRecipientError(error: unknown): boolean {
  return error instanceof LineApiError && (error.status === 400 || error.status === 404);
}

export class CampaignDispatchService {
  private readonly operational: OperationalRepository;
  private readonly lark: LarkClient;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.lark = new LarkClient(env);
  }

  async dispatch(draftId: string, caseId: string): Promise<void> {
    const draft = await this.operational.getDraft<CampaignStoredDraft>(draftId);
    if (!draft || draft.kind !== "campaign" || draft.case_id !== caseId) return;
    const route = await this.operational.getCase(caseId);
    if (!route?.root_message_id) throw new Error("Campaign case/root message not found");

    const recipients = Array.from(new Set(draft.payload.recipients.filter(Boolean)));
    if (recipients.length === 0) {
      await this.operational.finishDraft(draft.draft_id);
      await this.lark.replyText(route.root_message_id, `ℹ️ Campaign ${draft.payload.campaign.segment.toUpperCase()} ไม่มี LINE users ที่ผ่านเงื่อนไข`);
      return;
    }

    let accepted = 0;
    let fallbackAccepted = 0;
    let failed = 0;
    const message = campaignFlex(companyName(this.env), draft.payload.campaign);

    for (let index = 0; index < recipients.length; index += 500) {
      const batchIndex = Math.floor(index / 500);
      const users = recipients.slice(index, index + 500);
      const retryKey = await stableUuid(`campaign:${draft.draft_id}:${batchIndex}`);
      await this.operational.ensureCampaignBatch(draft.draft_id, batchIndex, retryKey, users.length);
      const state = await this.operational.getCampaignBatch(draft.draft_id, batchIndex);
      if (state?.state === "SENT") {
        accepted += users.length;
        fallbackAccepted += state.fallback_count;
        continue;
      }
      if (state?.state === "PARTIAL") {
        accepted += users.length - state.failed_count;
        fallbackAccepted += state.fallback_count;
        failed += state.failed_count;
        continue;
      }

      try {
        await multicastLineMessages(this.env, users, [message], state?.retry_key || retryKey);
        await this.operational.markCampaignBatchResult(draft.draft_id, batchIndex, { state: "SENT" });
        accepted += users.length;
        continue;
      } catch (error) {
        // Only a deterministic 4xx recipient/request rejection is eligible for
        // individual fallback. 429/5xx/network/auth errors are retried by Queue
        // with the same retry keys so an ambiguously accepted multicast is never
        // followed by duplicate individual pushes.
        if (!isSafePermanentRecipientError(error)) throw error;
      }

      let batchFallbackAccepted = 0;
      let batchFailed = 0;
      let lastError = "";
      for (const userId of users) {
        const userRetryKey = await stableUuid(`campaign-fallback:${draft.draft_id}:${batchIndex}:${userId}`);
        try {
          await pushLineMessages(this.env, userId, [message], userRetryKey);
          batchFallbackAccepted += 1;
        } catch (error) {
          if (!isSafePermanentRecipientError(error)) throw error;
          batchFailed += 1;
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      await this.operational.markCampaignBatchResult(draft.draft_id, batchIndex, {
        state: batchFailed > 0 ? "PARTIAL" : "SENT",
        fallbackCount: batchFallbackAccepted,
        failedCount: batchFailed,
        error: lastError || undefined,
      });
      accepted += batchFallbackAccepted;
      fallbackAccepted += batchFallbackAccepted;
      failed += batchFailed;
    }

    await this.operational.finishDraft(draft.draft_id);
    await this.lark.replyText(
      route.root_message_id,
      `🚀 Campaign ${draft.payload.campaign.segment.toUpperCase()} ประมวลผลแล้ว • accepted=${accepted} • fallback=${fallbackAccepted} • failed=${failed}\nหมายเหตุ: accepted หมายถึง API รับคำขอ ไม่ใช่การรับประกันว่าผู้รับเปิดอ่านข้อความ`,
    );
  }
}
