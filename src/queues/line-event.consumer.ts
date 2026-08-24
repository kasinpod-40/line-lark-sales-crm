import type { Env } from "../config/env";
import type { CrmQueueMessage, QueueBatchLike } from "./line-event.types";
import { CaseService } from "../services/case.service";
import { CampaignDispatchService } from "../services/campaign-dispatch.service";
import { CommercialLifecycleService } from "../services/commercial-lifecycle.service";

export async function handleLineQueueBatch(batch: QueueBatchLike<CrmQueueMessage>, env: Env): Promise<void> {
  const cases = new CaseService(env);
  const campaigns = new CampaignDispatchService(env);
  const lifecycle = new CommercialLifecycleService(env);
  for (const message of batch.messages) {
    try {
      const body = message.body;
      if (!body || body.schema_version !== 1) {
        console.warn("CRM_QUEUE_INVALID_MESSAGE", message.id);
        message.ack();
        continue;
      }

      if (body.channel === "LINE") {
        await cases.processLineEvent(body);
        // AI describes the newest message; commercial lifecycle describes the
        // furthest verified sales step. Re-apply the commercial floor after
        // every inbound so generic messages can never demote Quote/Payment/Won.
        await lifecycle.reconcileByLineUserId(body.user_id);
      } else if (body.channel === "CRM" && body.job_type === "campaign_dispatch") {
        await campaigns.dispatch(body.draft_id, body.case_id);
      } else {
        console.warn("CRM_QUEUE_UNSUPPORTED_MESSAGE", message.id);
        message.ack();
        continue;
      }
      message.ack();
    } catch (error) {
      console.error("CRM_QUEUE_PROCESS_FAILED", message.id, error instanceof Error ? error.message : String(error));
      message.retry({ delaySeconds: Math.min(300, Math.max(5, 2 ** Math.min(message.attempts, 8))) });
    }
  }
}
