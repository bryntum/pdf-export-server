// Readiness: one Chromium launch at boot proves the image can render before the
// pod receives traffic. Drain: on SIGTERM stop accepting, let in-flight exports
// finish, give up after the grace period.
async function warmUp(queue, logger) {
    const browser = await queue.startPuppeteer(queue);
    await browser.close();
    logger.log('info', 'Chromium warm-up succeeded, server is ready');
}

async function drain({ pending, server, graceMs = 30000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
    await new Promise(resolve => server.close(resolve));
    const deadline = now() + graceMs;
    while (pending.size > 0) {
        if (now() >= deadline) {
            return 'timeout';
        }
        await sleep(500);
    }
    return 'drained';
}

module.exports = { warmUp, drain };
