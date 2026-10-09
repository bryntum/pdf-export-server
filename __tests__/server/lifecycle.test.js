const { drain } = require('../../src/server/lifecycle.js');

const makeServer = () => ({ close : jest.fn(cb => cb()), closeIdleConnections : jest.fn(), closeAllConnections : jest.fn() });

test('drain resolves "drained" as soon as nothing is pending', async () => {
    const server = makeServer();
    await expect(drain({ pending : new Set(), servers : [server], graceMs : 1000, sleep : () => Promise.resolve() })).resolves.toBe('drained');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
});

test('drain waits for in-flight requests and gives up after the grace period', async () => {
    const server = makeServer();
    let clock = 0;
    const result = await drain({
        pending : new Set(['a']), servers : [server], graceMs : 30000,
        now     : () => clock,
        sleep   : () => { clock += 10000; return Promise.resolve(); }
    });
    expect(result).toBe('timeout');
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
});

test('drain closes every server and websocket server', async () => {
    const a = makeServer(), b = makeServer(), ws = { close : jest.fn() };
    await drain({ pending : new Set(), servers : [a, b], wsServers : [ws], sleep : () => Promise.resolve() });
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledTimes(1);
});

test('drain does not await the close callback', async () => {
    const server = { close : jest.fn() };
    const pending = new Set(['a']);
    const result = await drain({ pending, servers : [server], sleep : () => { pending.clear(); return Promise.resolve(); } });
    expect(result).toBe('drained');
});
