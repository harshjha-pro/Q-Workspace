/** Next.js boot hook: start the in-process scheduler once, on the Node.js server only. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
