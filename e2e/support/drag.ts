import type { Page } from "@playwright/test";

/**
 * Call after picking an item up from the keyboard, before the first arrow key. The drag library
 * (dnd-kit) announces the pickup first and starts listening for keys on a timer it queues
 * during that same key press, so a key sent at once can go unheard. A timer queued now runs
 * after that one.
 */
export async function dragListening(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => setTimeout(done)));
}
