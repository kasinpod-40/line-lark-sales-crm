import type { QueueProducerBinding } from "../queues/line-event.types";
import type { LineEventQueueMessage } from "../queues/line-event.types";

export interface Env {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_EVENTS_QUEUE: QueueProducerBinding<LineEventQueueMessage>;
}
