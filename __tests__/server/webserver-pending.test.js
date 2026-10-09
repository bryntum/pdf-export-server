const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const WebServer = require('../../src/server/WebServer.js');

function makeServer(handler) {
    const server = Object.create(WebServer.prototype);
    server.pendingRequests = new Set();
    server.config = {};
    server.logger = { log : jest.fn(), error : jest.fn() };
    server.metrics = { observe : jest.fn(), refused : jest.fn() };
    server.exportRequestHandler = handler;
    return server;
}

function makeRes() {
    const res = new EventEmitter();
    const sink = new Writable({ write(chunk, enc, cb) { cb(); } });
    res.set = jest.fn();
    res.status = jest.fn(() => res);
    res.jsonp = jest.fn(() => res);
    res.headersSent = false;
    res.on('pipe-src', () => {});
    res.write = sink.write.bind(sink);
    res.end = sink.end.bind(sink);
    res.once = EventEmitter.prototype.once.bind(res);
    // pipe() needs a few writable-ish methods
    res.removeListener = EventEmitter.prototype.removeListener.bind(res);
    return res;
}

const req = id => ({ id, headers : {}, socket : {}, body : { html : [], sendAsBinary : true, fileFormat : 'pdf' } });
const settle = () => new Promise(r => setImmediate(r));

test('binary path keeps the request pending until the response closes', async () => {
    const stream = new PassThrough();
    const server = makeServer(() => Promise.resolve(stream));
    const res = makeRes();

    server.handleExportPOSTRequest(req('a'), res);
    await settle();
    await settle();
    expect(server.pendingRequests.size).toBe(1);

    stream.end('%PDF-');
    await settle();
    expect(server.pendingRequests.size).toBe(1);

    res.emit('close');
    expect(server.pendingRequests.size).toBe(0);
});

test('two requests sharing an X-Request-Id are tracked separately', async () => {
    const server = makeServer(() => new Promise(() => {}));
    server.handleExportPOSTRequest(req('same'), makeRes());
    server.handleExportPOSTRequest(req('same'), makeRes());
    expect(server.pendingRequests.size).toBe(2);
});

test('failed export releases the request at once and a non-Error rejection is normalised', async () => {
    const server = makeServer(() => Promise.reject('boom'));
    const res = makeRes();
    server.handleExportPOSTRequest(req('f'), res);
    await settle();
    await settle();
    expect(server.pendingRequests.size).toBe(0);
    expect(res.jsonp).toHaveBeenCalledWith(expect.objectContaining({ success : false, msg : 'boom' }));
    expect(server.metrics.observe).toHaveBeenCalledWith(expect.objectContaining({ result : 'failed' }));
});

test('a throw in the success path with nothing recorded counts as failed', async () => {
    const server = makeServer(() => Promise.resolve(null)); // fileStream.on throws
    const res = makeRes();
    server.handleExportPOSTRequest(req('t'), res);
    await settle();
    await settle();
    expect(server.metrics.observe).toHaveBeenCalledTimes(1);
    expect(server.metrics.observe).toHaveBeenCalledWith(expect.objectContaining({ result : 'failed' }));
    expect(server.pendingRequests.size).toBe(0);
});
