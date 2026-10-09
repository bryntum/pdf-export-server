const { startServer, stopServer, getLoggerConfig, getPort } = require('../utils.js');

jest.setTimeout(60 * 1000);

let server;
afterEach(() => server && stopServer(server).then(() => (server = null)));

async function post(port, body) {
    const response = await fetch(`http://localhost:${port}/`, {
        method  : 'POST',
        headers : { 'Content-Type' : 'application/json' },
        body    : JSON.stringify(body)
    });
    return { status : response.status, headers : response.headers, json : (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.arrayBuffer() };
}

test('refuses more pages than max-pages with 413', async () => {
    server = await startServer({ protocol : 'http', port : getPort(), workers : 1, 'max-pages' : 1, logger : getLoggerConfig('e2e_limits_413') });
    const result = await post(server.httpPort, {
        html : [{ html : '<p>1</p>' }, { html : '<p>2</p>' }], format : 'A4', fileFormat : 'pdf', orientation : 'portrait', range : 'complete', sendAsBinary : true
    });
    expect(result.status).toBe(413);
    expect(result.json.code).toBe('TOO_MANY_PAGES');
});

test('refuses a full queue with 503 and does not count the refused request', async () => {
    server = await startServer({ protocol : 'http', port : getPort(), workers : 1, 'max-queue' : 1, logger : getLoggerConfig('e2e_limits_503') });
    const body = { html : [{ html : '<p>slow</p>' }], format : 'A4', fileFormat : 'pdf', orientation : 'portrait', range : 'complete', sendAsBinary : true };
    const first = post(server.httpPort, body);           // occupies the single slot
    await new Promise(r => setTimeout(r, 50));
    const second = await post(server.httpPort, body);
    expect(second.status).toBe(503);
    expect(second.headers.get('retry-after')).toBe('10');
    expect(second.json.code).toBe('QUEUE_FULL');
    await first;
    expect(server.pendingRequests.size).toBe(0);
});
