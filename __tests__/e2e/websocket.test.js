/**
 * E2E tests for WebSocket connectivity.
 * These tests verify that the WebSocket server correctly handles connections and export requests.
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { startServer, stopServer, getLoggerConfig, getPort } = require('../utils.js');

jest.setTimeout(60 * 1000);

// E2E tests use {port} placeholder - replaced with actual server port when sending request
const testPageHTML = fs.readFileSync(path.join(__dirname, '../samples/smoke/base.html'), 'utf-8');

let server;

afterEach(async () => {
    if (server) {
        await stopServer(server);
        server = null;
    }
});

/**
 * Helper to create WebSocket connection
 */
function createWebSocketConnection(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/`);

        ws.on('error', (error) => {
            reject(new Error(`WebSocket connection failed: ${error.message}`));
        });

        ws.on('open', () => {
            resolve(ws);
        });
    });
}

/**
 * Helper to send messages and wait for response
 */
function sendAndReceive(ws, messages, expectBinary = true) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for WebSocket response'));
        }, 30000);

        ws.on('message', (data, isBinary) => {
            clearTimeout(timeout);
            if (expectBinary && isBinary) {
                resolve(Buffer.from(data));
            }
            else if (!expectBinary && !isBinary) {
                resolve(JSON.parse(data.toString()));
            }
            else {
                reject(new Error(`Unexpected message type: expected ${expectBinary ? 'binary' : 'text'}`));
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        // Send all messages in sequence
        for (const msg of messages) {
            ws.send(JSON.stringify(msg));
        }
    });
}

describe('E2E WebSocket', () => {
    test('Should establish WebSocket connection', async () => {
        const port = getPort();

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('e2e_ws_connect')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        expect(ws).toBeDefined();
        expect(ws.readyState).toBe(WebSocket.OPEN);

        ws.close();
    });

    test('Should export PDF via WebSocket with binary response', async () => {
        const port = getPort();

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('e2e_ws_binary')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        // Replace {port} with actual server port for resource loading
        const htmlWithPort = testPageHTML.replace(/{port}/g, server.httpPort);

        const exportMessage = {
            fileFormat  : 'pdf',
            fileName    : 'test',
            format      : 'A4',
            orientation : 'portrait',
            clientURL   : `http://localhost:${server.httpPort}/resources/build/grid.css`,
            html        : [{ html : htmlWithPort }]
        };

        const doneMessage = {
            done         : true,
            sendAsBinary : true
        };

        const response = await sendAndReceive(ws, [exportMessage, doneMessage], true);

        // Verify we received binary PDF data
        expect(Buffer.isBuffer(response)).toBe(true);
        expect(response.length).toBeGreaterThan(0);
        expect(response.slice(0, 4).toString('utf8')).toBe('%PDF');

        ws.close();
    });

    test('Should export PDF via WebSocket with URL response', async () => {
        const port = getPort();

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('e2e_ws_url')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        // Replace {port} with actual server port for resource loading
        const htmlWithPort = testPageHTML.replace(/{port}/g, server.httpPort);

        const exportMessage = {
            fileFormat  : 'pdf',
            fileName    : 'test',
            format      : 'A4',
            orientation : 'portrait',
            clientURL   : `http://localhost:${server.httpPort}/resources/build/grid.css`,
            html        : [{ html : htmlWithPort }]
        };

        const doneMessage = {
            done         : true,
            sendAsBinary : false
        };

        const response = await sendAndReceive(ws, [exportMessage, doneMessage], false);

        // Verify we received a JSON response with URL
        expect(response).toBeDefined();
        expect(response.success).toBe(true);
        expect(response.url).toBeDefined();
        expect(response.url).toMatch(/^http:\/\/localhost:\d+\//);

        ws.close();
    });
});
