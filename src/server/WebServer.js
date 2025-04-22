const express = require('express');
const addRequestId = require('express-request-id')();
const bodyParser = require('body-parser');
const nanoid = require('nanoid');
const http = require('http');
const https = require('https');
const { server : WebSocketServer, connection : WebSocketConnection } = require('websocket');
const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');
const { buffer } = require('node:stream/consumers');
const ExportServer = require('./ExportServer.js');
const { RequestCancelError } = require('../exception.js');
const { getId } = require('../utils/helpers.js');

module.exports = class WebServer extends ExportServer {
    constructor(config) {
        super(config);

        this.files = {};

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

        app.use(addRequestId);
        app.use(bodyParser.json({ limit : options.maximum || '50mb' }));
        app.use(bodyParser.urlencoded({ extended : false, limit : options.maximum || '50mb' }));

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

        //Set target to load resources from
        if (options.resources) {
            // app.use('/resources', express.static(options.resources));
            app.use('/resources', serveStatic(options.resources));
        }

        app.get('/status', me.handleStatus.bind(me));

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
                    httpServer : me.httpServer,
                    maxReceivedFrameSize : 0x1000000,
                    maxReceivedMessageSize : 0x5000000
                });

                me.wsServer.on('request', me.handleExportWebSocketRequest.bind(me));
                me.wsServer._connectionTimeout = options.timeout;
            }
        }

        if (options.https) {
            me.httpsPort = options.https;
            //Create https server and pass certificate folder
            me.httpsServer = me.createHttpsServer(path.join(process.cwd(), 'cert'));
            me.httpsServer.timeout = options.timeout;

            if (options.websocket) {
                me.wssServer = new WebSocketServer({
                    httpServer : me.httpsServer,
                    maxReceivedFrameSize : 0x1000000,
                    maxReceivedMessageSize : 0x5000000
                });

                me.wssServer.on('request', me.handleExportWebSocketRequest.bind(me));
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
            delete me.files[fileKey];
        }, 10000);

        return url;
    }

    handleStatus(req, res) {
        res.status(200).jsonp({
            success : true,
            websocket : this.wsServer != null || this.wssServer != null
        });
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

        //Accepts encoded and parsed html fragments. If still encoded, then parse
        if (typeof request.html === 'string') {
            request.html = JSON.parse(request.html);
        }

        me.logger.log('info', `POST request ${req.id}`);
        me.logger.log('verbose', `POST request ${req.id} headers: ${JSON.stringify(req.headers)}`);

        //Pass the request to the processFn
        me.exportRequestHandler(request, req.id, req.socket).then(fileStream => {
            me.logger.log('info', `POST request ${req.id} succeeded`);

            //On binary the buffer is directly sent to the client, else store file locally in memory for 10 seconds
            if (request.sendAsBinary) {
                res.set('Content-Type', 'application/octet-stream');
                res.status(200);
                fileStream.pipe(res);
            }
            else {
                //Send the url for the cached file, will is cached for 10 seconds
                res.status(200).jsonp({
                    success : true,
                    url     : me.setFile(req.protocol + '://' + req.get('host') + req.originalUrl, request, fileStream)
                });
            }
        }).catch(e => {
            if (e instanceof RequestCancelError) {
                // Shorthand call doesn't work here for some reason
                me.logger.log('verbose', `POST request ${req.id} cancelled`);
            }
            else {
                // Shorthand call doesn't work here for some reason
                me.logger.log('warn', `POST request ${req.id} failed`);
                me.logger.log('warn', e.stack);

                //Make up min 500 or 200?
                res.status(request.sendAsBinary ? 500 : 200).jsonp({
                    success : false,
                    msg     : e.message,
                    stack   : e.stack
                });
            }
        });
    }

    handleExportWebSocketRequest(request) {
        const connection = request.accept();
        const me = this;
        const { timeout } = (me.httpServer || me.httpsServer);
        const connectionId = getId();

        const config = {};
        const pages = [];

        let timer;

        me.logger.log('info', `[WebSocket@${connectionId}] Connection opened`);
        me.logger.log('verbose', `[WebSocket@${connectionId}] Remote address: ${connection.remoteAddress}`);

        connection.on('message', async function (message) {
            if (!timer) {
                timer = setTimeout(() => {
                    connection.drop(WebSocketConnection.CLOSE_REASON_NORMAL, `Export request did not finish in ${timeout}ms`)
                }, timeout);
            }

            if (message.type === 'utf8') {
                const request = JSON.parse(message.utf8Data);

                // If this is a final message, start generating PDF
                if (request.done) {
                    config.html = pages;

                    const fileStream = await me.exportRequestHandler(config, connectionId, connection);

                    if (connection.connected) {
                        clearTimeout(timer);

                        if (request.sendAsBinary) {
                            const buf = await buffer(fileStream);
                            connection.sendBytes(buf);
                        }
                        else {
                            connection.sendUTF(JSON.stringify({
                                success : true,
                                url     : me.setFile('http://localhost:8080/', config, fileStream)
                            }));
                        }
                    }
                }
                else {
                    pages.push(request.html);

                    delete request.html;

                    Object.assign(config, request);
                }
            }
        });

        connection.on('close', function (reasonCode, description) {
            me.logger.log('info', `[WebSocket@${connectionId}] Connection closed`);
            me.logger.log('verbose', `[WebSocket@${connectionId}] reason: ${reasonCode} - ${description}`);
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
    start() {
        return Promise.all([
            this.startHttpServer(),
            this.startHttpsServer()
        ]);
    }
};
