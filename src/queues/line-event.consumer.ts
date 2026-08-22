import type { Env } from "../config/env";
import type { CrmQueueMessage, QueueBatchLike } from "./line-event.types";
import { CaseService } from "../services/case.service";
import { CampaignDispatchService } from "../services/campaign-dispatch.service";

export async function handleLineQueueBatch(batch: QueueBatchLike<CrmQueueMessage>, env: Env): Promise<void> {
  const cases = new CaseService(env);
  const campaigns = new CampaignDispatchService(env);
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
