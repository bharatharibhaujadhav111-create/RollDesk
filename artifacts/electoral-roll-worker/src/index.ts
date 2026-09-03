import { processQueuedJobs } from "../../electoral-roll-search/src/server/electoral-roll.ts";

const pollMs = Number(process.env.WORKER_POLL_MS ?? 5000);
const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 1);

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run() {
  console.log("Electoral roll indexing worker started");
  while (true) {
    try {
      const processed = await processQueuedJobs(batchSize);
      if (processed === 0) await wait(pollMs);
    } catch (error) {
      console.error(error);
      await wait(pollMs);
    }
  }
}

void run();
