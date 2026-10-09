const { spawn } = require('child_process');
const path = require('path');
const { getPort } = require('../utils.js');

jest.setTimeout(60 * 1000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('SIGTERM lets an in-flight render finish, exits 0 and never closes Chromium under it', async () => {
    const port = getPort();
    const child = spawn('node', ['src/server.js', '-h', String(port)], {
        cwd : path.join(__dirname, '..', '..'),
        env : { ...process.env }
    });
    let output = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));

    try {
        const deadline = Date.now() + 40000;
        let ready = false;
        while (!ready && Date.now() < deadline) {
            try {
                ready = (await fetch(`http://localhost:${port}/ready`)).status === 200;
            }
            catch (e) { /* not listening yet */ }
            if (!ready) await sleep(200);
        }
        expect(ready).toBe(true);

        const post = fetch(`http://localhost:${port}/`, {
            method  : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body    : JSON.stringify({
                html : [{ html : '<html><body><p>busy</p><script>const t=Date.now();while(Date.now()-t<4000){}</script></body></html>' }],
                format : 'A4', fileFormat : 'pdf', orientation : 'portrait', range : 'complete', sendAsBinary : true
            })
        });

        await sleep(1000);
        child.kill('SIGTERM');

        const response = await post;
        expect(response.status).toBe(200);
        const body = Buffer.from(await response.arrayBuffer());
        expect(body.subarray(0, 5).toString()).toBe('%PDF-');

        const { code } = await exited;
        expect(code).toBe(0);
        expect(output).not.toContain('Target closed');
    }
    finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
});
