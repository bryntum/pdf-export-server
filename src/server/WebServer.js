const express = require('express');
const addRequestId = require('express-request-id')();
const bodyParser = require('body-parser');
const nanoid = require('nanoid');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');
const ExportServer = require('./ExportServer.js');
const { RequestCancelError } = require('../exception.js');
const { Storage, File } = require('@google-cloud/storage');

function doRequest(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                resolve(JSON.parse(responseBody));
            });
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

  
module.exports = class WebServer extends ExportServer {
    constructor(config) {
        super(config);

        this.files = {};

        this.createServer(config);
    }

    /**
     * Create the and initialise the webserver
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
        app.enable('trust proxy');

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

        //Get the file, fileKey will be a guid. This serves the pdf
        app.get('/:fileKey/', (req, res) => {
            const
                fileKey = req.params.fileKey,
                file    = me.files[fileKey];

            if (file) {
                res.set('Content-Type', 'application/' + file.fileFormat);

                // Use "inline" to be able to preview PDF file in a browser tab
                // res.set('Content-Disposition', 'inline; filename="' + file.fileName + '"');
                res.set('Content-Disposition', 'form-data; filename="' + file.fileName + '"');

                res.set('Access-Control-Expose-Headers', 'Content-Length');
                res.set('Content-Length', file.buffer.length);
                res.status(200).send(file.buffer);

                delete me.files[fileKey];
            }
            else {
                res.send('File not found');
            }
        });

        //Catch the posted request.
        if (!options.dedicated) {
            app.post('/', async (req, res) => {
                let request = req.body;
                const originalRequest = request

                if(request.signedUrl){
                    const bodyAsFile = await doRequest(request.signedUrl);
                    request = bodyAsFile;
                }

                //Accepts encoded and parsed html fragments. If still encoded, then parse
                if (typeof request.html === 'string') {
                    request.html = JSON.parse(request.html);
                }

                me.logger.log('info', `POST request ${req.id}`);
                me.logger.log('verbose', `POST request ${req.id} headers: ${JSON.stringify(req.headers)}`);

                //Pass the request to the processFn
                me.exportRequestHandler(request, req.id, req).then(async file => {
                    me.logger.log('info', `POST request ${req.id} succeeded`);

                    //On binary the buffer is directly sent to the client, else store file locally in memory for 10 seconds
                    if (request.sendAsBinary) {
                        res.set('Content-Type', 'application/octet-stream');
                        res.status(200).send(file);
                    }
                    else {
                        if(options.gcp){
                          const fileUrl = await me.setGCPFile(originalRequest, file)
                          res.status(200).jsonp({
                              success : true,
                              url     : fileUrl
                          });
                        }
                        else {
                          //Send the url for the cached file, will is cached for 10 seconds
                          res.status(200).jsonp({
                              success : true,
                              url     : me.setFile(req.protocol + '://' + req.get('host') + req.originalUrl, request, file)
                          });
                        }
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
            });
        }

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
        }

        if (options.https) {
            me.httpsPort = options.https;
            //Create https server and pass certificate folder
            me.httpsServer = me.createHttpsServer(path.join(process.cwd(), 'cert'));
            me.httpsServer.timeout = options.timeout;
        }

    }

    /**
     * Stores a file stream temporarily to be fetched on guid
     *
     * @param host This host to fetch from
     * @param request Passed initial request
     * @param file The file buffer pdf/png
     * @returns {*}
     */
    setFile(host, request, file) {
        const
            me      = this,
            fileKey = nanoid(),
            url     = host + fileKey;

        me.files[fileKey] = {
            date       : new Date(),
            fileFormat : request.fileFormat,
            fileName   : `${request.fileName || `export-${request.range}`}.${request.fileFormat}`,
            buffer     : file
        };

        //You got ten seconds to fetch the file
        setTimeout(() => {
            delete me.files[fileKey];
        }, 10000);

        return url;
    }

    /**
     * Stores a file streams on GCP to be fetched on guid
     *
     * @param fileBuffer The file buffer pdf/png
     * @returns {*}
     */
    async setGCPFile(request, fileBuffer) {
      const { bucket: bucketName, gcpName, name } = request

      const bucket = new Storage().bucket(bucketName);
      const file = new File(bucket, gcpName);

      await file.save(fileBuffer);

      const [url] = await file.getSignedUrl({
        action: 'read',
        responseDisposition: `attachment; filename=${name}`,
        expires: Date.now() + 60 * 60 * 1000 /* 1h */
      });

      return url;
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

    getHttpServer() {
        return this.httpServer;
    }

    getHttpsServer() {
        return this.httpsServer;
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
