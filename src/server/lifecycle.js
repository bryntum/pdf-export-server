// Readiness: one Chromium launch at boot proves the image can render before the
// pod receives traffic. Drain: on SIGTERM stop accepting, let in-flight exports
// finish, give up after the grace period.
async function warmUp(queue, logger) {
    const browser = await queue.startPuppeteer(queue);
    await browser.close();
    logger.log('info', 'Chromium warm-up succeeded, server is ready');
}

async function drain({ pending, servers = [], wsServers = [], graceMs = 30000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
    const deadline = now() + graceMs;

    // Stop accepting. The close callback only fires once every connection has ended,
    // so it must not be awaited or it would defeat the grace period.
    for (const server of servers) {
        server.close(() => {});
        server.closeIdleConnections?.();
    }
    for (const ws of wsServers) {
        try {
            ws.close();
        }
        catch (e) {
            // best-effort
        }
    }

    while (pending.size > 0) {
        if (now() >= deadline) {
            for (const server of servers) {
                server.closeAllConnections?.();
            }
            return 'timeout';
        }
        await sleep(500);
    }
    return 'drained';
}

module.exports = { warmUp, drain };
