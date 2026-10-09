const express = require('express');
const addRequestId = require('express-request-id').default;
const bodyParser = require('body-parser');
const { nanoid } = require('nanoid');
const http = require('http');
const https = require('https');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');
const { buffer } = require('node:stream/consumers');
const ExportServer = require('./ExportServer.js');
const { RequestCancelError } = require('../exception.js');
const { getId } = require('../utils/helpers.js');
const { checkLimits } = require('./limits.js');
const { warmUp } = require('./lifecycle.js');
const { createMetrics } = require('./metrics.js');
const packageInfo = require('../../package.json');

const CLOSE_REASON = {
    NORMAL : 1000
}

module.exports = class WebServer extends ExportServer {
    constructor(config) {
        super(config);

        console.log(`[${packageInfo.name}@${packageInfo.version}] Starting server...`);

        this.files = {};
        this.pendingRequests = new Set();
        this.config = config;
        this.metrics = createMetrics({ queue : this.taskQueue, pendingRequests : this.pendingRequests });

        this.createServer(config);
    }

    /**
     * Create and initialise the webserver
     *
     * @param options The passed options from the command line
     */
    createServer(options) {
        const
            me  = this,
            app = me.app = express();

        options = Object.assign({
            timeout : 5 * 60 * 1000 // 5 minutes
        }, options);

        app.use(addRequestId());
        app.use(bodyParser.json({ limit : options.maximum || '100mb' }));
        app.use(bodyParser.urlencoded({ extended : false, limit : options.maximum || '100mb' }));

        //Set CORS
        if (options.cors !== 'false') {
            options.cors = options.cors || '*';

            console.log(`Access-Control-Allow-Origin: ${options.cors}`);

            app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', options.cors);
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
                next();
            });
        }

        //Set a target to load resources from
        if (options.resources) {
            const resourcePath = path.join(process.cwd(), options.resources);
            console.log(`Serving resources from ${resourcePath}`);
            app.use('/resources', serveStatic(resourcePath));
        }

        app.get('/status', me.handleStatus.bind(me));
        app.get('/ready', me.handleReady.bind(me));
        app.get('/metrics', async(req, res) => {
            try {
                const body = await me.metrics.registry.metrics();
                res.set('Content-Type', me.metrics.contentType);
                res.end(body);
            }
            catch (e) {
                me.logger.log('warn', `metrics failed: ${e && e.stack || e}`);
                res.status(500).end();
            }
        });

        //Get the file, fileKey will be a guid. This serves the pdf
        app.get('/:fileKey/', me.handleFileKey.bind(me));

        //Catch the posted request.
        app.post('/', me.handleExportPOSTRequest.bind(me));

        // order matters, this logger should be the last one
        app.use((err, req, res, next) => {
            me.logger.error(err.stack);
            next(err);
        });

        if (options.http) {
            me.httpPort = options.http;
            me.findNextHttpPort = options.findNextHttpPort;
            me.httpServer = me.createHttpServer();
            me.httpServer.timeout = options.timeout;

            if (options.websocket) {
                me.wsServer = new WebSocketServer({
                    server     : me.httpServer,
                    maxPayload : 0x5000000
                });

                me.wsServer.on('connection', (ws, req) => me.handleExportWebSocketConnection(ws, req, options.timeout));
            }
        }

        if (options.https) {
            const certPath = process.pkg
                ? path.join(process.execPath, '..', 'cert')
                : path.join(__dirname, '..', '..', 'cert');

            me.httpsPort = options.https;
            //Create https server and pass certificate folder
            me.httpsServer = me.createHttpsServer(certPath);
            me.httpsServer.timeout = options.timeout;

            if (options.websocket) {
                me.wssServer = new WebSocketServer({
                    server     : me.httpsServer,
                    maxPayload : 0x5000000
                });

                me.wssServer.on('connection', (ws, req) => me.handleExportWebSocketConnection(ws, req, options.timeout));
            }
        }
    }

    /**
     * Stores a file stream temporarily to be fetched on guid
     *
     * @param host This host to fetch from
     * @param request Passed initial request
     * @param fileStream The pdf/png file stream
     * @returns {*}
     */
    setFile(host, request, fileStream) {
        const
            me      = this,
            fileKey = nanoid(),
            url     = host + fileKey;

        me.files[fileKey] = {
            date       : new Date(),
            fileFormat : request.fileFormat,
            fileName   : `${request.fileName || `export-${request.range}`}.${request.fileFormat}`,
            fileStream
        };

        //You got ten seconds to fetch the file
        setTimeout(() => {
            me.logger.log('verbose', `File ${fileKey} expired`);
            delete me.files[fileKey];
        }, 10000);

        return url;
    }

    handleStatus(req, res) {
        res.status(200).jsonp({
            success : true,
            version : packageInfo.version,
            websocket : this.wsServer != null || this.wssServer != null
        });
    }

    handleReady(req, res) {
        res.status(this.ready ? 200 : 503).jsonp({ ready : Boolean(this.ready) });
    }

    handleFileKey(req, res) {
        const
            fileKey = req.params.fileKey,
            file    = this.files[fileKey];

        if (file) {
            res.set('Content-Type', 'application/' + file.fileFormat);

            // Use "inline" to be able to preview PDF file in a browser tab
            // res.set('Content-Disposition', 'inline; filename="' + file.fileName + '"');
            res.set('Content-Disposition', 'form-data; filename="' + file.fileName + '"');

            res.set('Access-Control-Expose-Headers', 'Content-Length');
            res.status(200);
            file.fileStream.pipe(res);

            delete this.files[fileKey];
        }
        else {
            res.send('File not found');
        }
    }

    handleExportPOSTRequest(req, res) {
        const request = req.body;
        const me = this;
        const startedAt = Date.now();

        //Accepts encoded and parsed html fragments. If still encoded, then parse
        if (typeof request.html === 'string') {
            request.html = JSON.parse(request.html);
        }

        const refusal = checkLimits({
            pages    : Array.isArray(request.html) ? request.html.length : 0,
            pending  : me.pendingRequests.size,
            maxPages : me.config['max-pages'],
            maxQueue : me.config['max-queue']
        });

        if (refusal) {
            me.logger.log('warn', `POST request ${req.id} refused: ${refusal.body.code}`);
            me.metrics.refused();
            res.set(refusal.headers || {});
            res.status(refusal.status).jsonp(refusal.body);
            return;
        }

        // Keyed by a per-request token: express-request-id reuses a client supplied X-Request-Id, so req.id can collide
        const pendingToken = Symbol(req.id);
        const state = { recorded : false, deferRelease : false };
        me.pendingRequests.add(pendingToken);
        me.logger.log('info', `POST request ${req.id}`);
        me.logger.log('verbose', `POST request ${req.id} headers: ${JSON.stringify(req.headers)}`);

        //Pass the request to the processFn
        me.exportRequestHandler(request, req.id, req.socket).then(fileStream => {
            me.logger.log('info', `POST request ${req.id} succeeded`);

            //On binary the buffer is directly sent to the client, else store file locally in memory for 10 seconds
            if (request.sendAsBinary) {
                res.set('Content-Type', 'application/octet-stream');
                res.status(200);
                let bytes = 0;
                // The request stays pending until the PDF is fully written, so drain does not exit mid-stream
                state.deferRelease = true;
                res.once('close', () => me.pendingRequests.delete(pendingToken));
                fileStream.on('data', chunk => bytes += chunk.length);
                fileStream.pipe(res);
                me.finishRequest(req, request, { bytes : () => bytes, result : 'success', startedAt }, res, state);
            }
            else {
                //Send the url for the cached file, will is cached for 10 seconds
                res.status(200).jsonp({
                    success : true,
                    url     : me.setFile(req.protocol + '://' + req.get('host') + req.originalUrl, request, fileStream)
                });
                me.finishRequest(req, request, { bytes : null, result : 'success', startedAt }, null, state);
            }
        }, rejection => {
            const e = rejection instanceof Error ? rejection : new Error(String(rejection));

            if (rejection instanceof RequestCancelError) {
                // Shorthand call doesn't work here for some reason
                me.logger.log('verbose', `POST request ${req.id} cancelled`);
                me.finishRequest(req, request, { bytes : null, result : 'cancelled', startedAt }, null, state);
            }
            else {
                // Shorthand call doesn't work here for some reason
                me.logger.log('warn', `POST request ${req.id} failed`);
                me.logger.log('warn', e.stack);
                me.finishRequest(req, request, { bytes : null, result : 'failed', startedAt }, null, state);

                //Make up min 500 or 200?
                res.status(request.sendAsBinary ? 500 : 200).jsonp({
                    success : false,
                    msg     : e.message,
                    stack   : e.stack
                });
            }
        }).catch(rejection => {
            const e = rejection instanceof Error ? rejection : new Error(String(rejection));

            // A failure while answering a successful export is not a second result: it is logged, never re-counted
            me.logger.log('warn', `POST request ${req.id} response failed: ${e.stack}`);

            // Nothing is streaming reliably any more: release in .finally (a later 'close' delete is harmless)
            state.deferRelease = false;

            // ...unless nothing was recorded yet (e.g. the success handler threw before recording)
            if (!state.recorded) {
                me.finishRequest(req, request, { bytes : null, result : 'failed', startedAt }, null, state);
            }

            if (!res.headersSent) {
                res.status(500).jsonp({ success : false, msg : e.message });
            }
        }).finally(() => {
            if (!state.deferRelease) {
                me.pendingRequests.delete(pendingToken);
            }
        });
    }

    /**
     * Records metrics and the structured request log line. When `res` is given (binary streaming) the record is made
     * once the response has been fully written, so duration and bytes are final.
     */
    finishRequest(req, request, { bytes, result, startedAt }, res, state) {
        if (state) {
            state.recorded = true;
        }

        const record = () => {
            try {
                this.metrics.observe({ result, durationSeconds : (Date.now() - startedAt) / 1000 });
                this.logRequest(req, request, { bytes : typeof bytes === 'function' ? bytes() : bytes, result, startedAt });
            }
            catch (e) {
                // Observability must never alter the response
            }
        };

        if (res) {
            res.once('close', record);
        }
        else {
            record();
        }
    }

    // Never logs export HTML or PDF content, only sizes and identifiers
    logRequest(req, request, { bytes, result, startedAt }) {
        const fields = {
            requestId  : req.id,
            tenant     : req.headers['x-tenant'] || null,
            userHash   : req.headers['x-user-hash'] || null,
            pages      : Array.isArray(request.html) ? request.html.length : 0,
            bytes,
            durationMs : Date.now() - startedAt,
            result
        };

        if (this.config['log-format'] === 'json') {
            this.logger.log('info', 'export request', fields);
        }
        else {
            this.logger.log('info', JSON.stringify(fields));
        }
    }

    handleExportWebSocketConnection(ws, req, timeout) {
        const me = this;
        const protocol = req.socket.server === me.httpServer ? 'http' : 'https';
        const host = req.headers.host || req.headers[':authority'] || 'localhost';
        const origin = `${protocol}://${host}/`;
        const connectionId = getId();
        const { remoteAddress } = req.socket;

        const config = {};
        const pages = [];

        let timer;

        me.logger.log('info', `[WebSocket@${connectionId}] Connection opened`);
        me.logger.log('verbose', `[WebSocket@${connectionId}] Remote address: ${remoteAddress}`);

        ws.on('message', async function (data, isBinary) {
            if (!timer) {
                timer = setTimeout(() => {
                    ws.close(CLOSE_REASON.NORMAL, `Export request did not finish in ${timeout}ms`);
                }, timeout);
            }

            if (!isBinary) {
                const request = JSON.parse(data.toString());

                // If this is a final message, start generating PDF
                if (request.done) {
                    config.html = pages;

                    me.logger.log('verbose', `[WebSocket@${connectionId}] Generating ${config.fileFormat.toUpperCase()}`);

                    const fileStream = await me.exportRequestHandler(config, connectionId, ws);

                    me.logger.log('verbose', `[WebSocket@${connectionId}] ${config.fileFormat.toUpperCase()} generated`);

                    if (ws.readyState === WebSocket.OPEN) {
                        clearTimeout(timer);

                        if (request.sendAsBinary) {
                            const buf = await buffer(fileStream);
                            ws.send(buf);

                            me.logger.log('verbose', `[WebSocket@${connectionId}] sent ${buf.length} bytes`);
                        }
                        else {
                            ws.send(JSON.stringify({
                                success : true,
                                url     : me.setFile(origin, config, fileStream)
                            }));
                        }
                    }
                    else {
                        me.logger.log('warn', `[WebSocket@${connectionId}] Connection closed before export finished`);
                    }
                }
                else {
                    pages.push(request.html);

                    delete request.html;

                    Object.assign(config, request);
                }
            }
        });

        ws.on('close', function (code, reason) {
            me.logger.log('info', `[WebSocket@${connectionId}] Connection closed`);
            me.logger.log('verbose', `[WebSocket@${connectionId}] reason: ${code} - ${reason}`);
        });
    }

    //Create http server instance
    createHttpServer() {
        return http.createServer(this.app);
    }

    //Start the server, listen on port
    startHttpServer() {
        if (this.httpServer) {
            return new Promise((resolve, reject) => {
                this.httpServer.on('error', e => {
                    if (e.code === 'EADDRINUSE' && this.findNextHttpPort) {
                        this.httpServer.listen(++this.httpPort);
                    }
                    else {
                        reject(e);
                    }
                });

                this.httpServer.on('listening', () => {
                    console.log('Http server started on port ' + this.httpPort);
                    resolve();
                });

                this.httpServer.listen(this.httpPort);
            });
        }
    }

    //Create the https server instance and read the certificates
    createHttpsServer(certPath) {
        const
            privateKey  = fs.readFileSync(path.join(certPath, 'server.key'), 'utf8'),
            certificate = fs.readFileSync(path.join(certPath, 'server.crt'), 'utf8'),
            credentials = { key : privateKey, cert : certificate };

        return https.createServer(credentials, this.app);
    }

    //Start the https server and listen on port
    startHttpsServer() {
        if (this.httpsServer) {
            return new Promise(resolve => {
                this.httpsServer.listen(this.httpsPort, () => {
                    console.log('Https server started on port ' + this.httpsPort);
                    resolve();
                });
            });
        }
    }

    /**
     * Start the service
     */
    async start() {
        const me = this;

        try {
            await Promise.all([
                me.startHttpServer(),
                me.startHttpsServer()
            ]);

            // Proves Chromium can launch before /ready reports 200
            await warmUp(me.taskQueue, me.logger);
            me.ready = true;
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }
};
