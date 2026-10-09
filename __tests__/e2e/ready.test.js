const { startServer, stopServer, getLoggerConfig, getPort } = require('../utils.js');

jest.setTimeout(60 * 1000);

test('/ready answers 200 once the server has warmed Chromium up', async () => {
    const server = await startServer({ protocol : 'http', port : getPort(), workers : 1, logger : getLoggerConfig('e2e_ready') });
    const response = await fetch(`http://localhost:${server.httpPort}/ready`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ready : true });
    await stopServer(server);
});
