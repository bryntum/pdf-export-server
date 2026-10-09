const { drain } = require('../../src/server/lifecycle.js');

test('drain resolves "drained" as soon as nothing is pending', async () => {
    const pending = new Set();
    const server = { close : jest.fn(cb => cb()) };
    await expect(drain({ pending, server, graceMs : 1000, sleep : () => Promise.resolve() })).resolves.toBe('drained');
    expect(server.close).toHaveBeenCalledTimes(1);
});

test('drain waits for in-flight requests and gives up after the grace period', async () => {
    const pending = new Set(['a']);
    const server = { close : jest.fn(cb => cb()) };
    let clock = 0;
    const result = await drain({
        pending, server, graceMs : 30000,
        now   : () => clock,
        sleep : () => { clock += 10000; return Promise.resolve(); }
    });
    expect(result).toBe('timeout');
});
