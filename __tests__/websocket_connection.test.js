const { startServer, stopServer, getLoggerConfig } = require('./utils.js');
const WebSocket = require('ws');
const testDataPDF = require('./samples/smoke/base_https.pdf.json');

jest.setTimeout(3 * 60 * 1000);

// Protocol template messages
const messages = [
    // message containing export metadata and generated HTML
    {
        fileFormat  : 'pdf',
        fileName    : 'Gantt',
        format      : 'A4',
        // html to render
        html        : [],
        orientation : 'portrait'
    },
    // message indicating that export is done and client is waiting for response
    {
        done         : true,
        // true if export should be sent as binary data and false if it should be sent as a link to download the file
        sendAsBinary : true
    }
];

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
 * Helper to send message and wait for response
 */
function sendAndReceive(ws, messages, expectBinary = true) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for WebSocket response'));
        }, 60000);

        ws.on('message', (data, isBinary) => {
            clearTimeout(timeout);
            if (expectBinary && isBinary) {
                resolve(Buffer.from(data));
            }
            else if (!expectBinary && !isBinary) {
                resolve(JSON.parse(data.toString()));
            }
            else {
                reject(new Error(`Unexpected message type: expected ${expectBinary ? 'binary' : 'text'}, got ${isBinary ? 'binary' : 'text'}`));
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        ws.on('close', (code, reason) => {
            clearTimeout(timeout);
            if (code !== 1000) {
                reject(new Error(`Connection closed unexpectedly: ${code} - ${reason}`));
            }
        });

        // Send all messages in sequence
        for (const msg of messages) {
            ws.send(JSON.stringify(msg));
        }
    });
}

describe('WebSocket Connection Tests', () => {
    test('Should establish WebSocket connection', async () => {
        const port = 8090;

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('ws_connection')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        expect(ws).toBeDefined();
        expect(ws.readyState).toBe(WebSocket.OPEN);

        ws.close();
    });

    test('Should receive binary PDF data when sendAsBinary is true', async () => {
        const port = 8091;

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('ws_binary_pdf')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        // Prepare messages with actual HTML content
        const exportMessage = {
            ...messages[0],
            html : testDataPDF.html
        };
        const doneMessage = {
            ...messages[1],
            sendAsBinary : true
        };

        const response = await sendAndReceive(ws, [exportMessage, doneMessage], true);

        // Verify we received binary data
        expect(Buffer.isBuffer(response)).toBe(true);
        expect(response.length).toBeGreaterThan(0);

        // PDF files start with %PDF
        const pdfHeader = response.slice(0, 4).toString('utf8');
        expect(pdfHeader).toBe('%PDF');

        ws.close();
    });

    test('Should receive URL when sendAsBinary is false', async () => {
        const port = 8092;

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('ws_url_response')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        // Prepare messages with actual HTML content
        const exportMessage = {
            ...messages[0],
            html : testDataPDF.html
        };
        const doneMessage = {
            ...messages[1],
            sendAsBinary : false
        };

        const response = await sendAndReceive(ws, [exportMessage, doneMessage], false);

        // Verify we received a JSON response with URL
        expect(response).toBeDefined();
        expect(response.success).toBe(true);
        expect(response.url).toBeDefined();
        expect(typeof response.url).toBe('string');
        expect(response.url).toMatch(/^http:\/\/localhost:\d+\//);

        ws.close();
    });

    test('Should handle multiple HTML pages sent sequentially', async () => {
        const port = 8093;

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('ws_multi_page')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        // Send first page with config
        const firstPageMessage = {
            fileFormat  : 'pdf',
            fileName    : 'MultiPage',
            format      : 'A4',
            orientation : 'portrait',
            html        : testDataPDF.html[0].html
        };

        // Send second page (just html, config is already set)
        const secondPageMessage = {
            html : testDataPDF.html[0].html
        };

        // Done message
        const doneMessage = {
            done         : true,
            sendAsBinary : true
        };

        const response = await sendAndReceive(
            ws,
            [firstPageMessage, secondPageMessage, doneMessage],
            true
        );

        // Verify we received binary PDF data
        expect(Buffer.isBuffer(response)).toBe(true);
        expect(response.length).toBeGreaterThan(0);

        // PDF files start with %PDF
        const pdfHeader = response.slice(0, 4).toString('utf8');
        expect(pdfHeader).toBe('%PDF');

        ws.close();
    });

    test('Should handle connection close gracefully', async () => {
        const port = 8094;

        server = await startServer({
            protocol  : 'http',
            port,
            workers   : 1,
            websocket : true,
            logger    : getLoggerConfig('ws_close')
        });

        const ws = await createWebSocketConnection(server.httpPort);

        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Close connection
        ws.close();

        // Wait a bit for close to propagate
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(ws.readyState).toBe(WebSocket.CLOSED);
    });
});
