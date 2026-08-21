import type { Env } from "../config/env";
import type { QueueBatchLike, LineEventQueueMessage } from "./line-event.types";
import { CaseService } from "../services/case.service";

export async function handleLineQueueBatch(batch: QueueBatchLike<LineEventQueueMessage>, env: Env): Promise<void> {
  const service = new CaseService(env);
  for (const message of batch.messages) {
    try {
      if (!message.body || message.body.schema_version !== 1 || message.body.channel !== "LINE") {
        console.warn("LINE_QUEUE_INVALID_MESSAGE", message.id);
        message.ack();
        continue;
      }
      await service.processLineEvent(message.body);
      message.ack();
    } catch (error) {
      console.error("LINE_QUEUE_PROCESS_FAILED", message.id, error instanceof Error ? error.message : String(error));
      message.retry({ delaySeconds: Math.min(300, Math.max(5, 2 ** Math.min(message.attempts, 8))) });
    }
  }
}
