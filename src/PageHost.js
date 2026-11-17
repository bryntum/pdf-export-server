const http = require('http');
const { randomUUID } = require('crypto');

const HOST = '127.0.0.1';

/**
 * Serves HTML of the pages being exported to the browser. Browser cannot be navigated to an HTML string, and a page
 * with content set directly has no origin. So HTML is kept in memory under a generated name and browser is
 * navigated to a local URL instead.
 *
 * Server only listens on the loopback interface, on a random port unless a specific one is configured. It can only
 * return content registered with {@link #function-add} and does not read anything from the file system.
 */
class PageHost {
    /**
     * @param {Object} [config]
     * @param {Number} [config.port] Port to listen on. Random free port is used by default
     */
    constructor({ port } = {}) {
        this.port = Number(port) || 0;

        // Generated id -> html
        this.pages = new Map();
        this.server = null;
        this._starting = null;
    }

    /**
     * Starts the server if it is not started yet.
     * @returns {Promise<void>}
     */
    start() {
        const me = this;

        if (!me._starting) {
            me._starting = new Promise((resolve, reject) => {
                const server = http.createServer(me.handleRequest.bind(me));

                server.once('error', e => {
                    me._starting = null;
                    e.message = `Unable to start local server for exported pages on ${HOST}:${me.port || '<random port>'}` +
                        `${me.port ? ' (see "page-port" config)' : ''}: ${e.message}`;
                    reject(e);
                });

                server.listen(me.port, HOST, () => {
                    // Do not keep the process alive because of this server
                    server.unref();
                    me.server = server;
                    resolve();
                });
            });
        }

        return me._starting;
    }

    /**
     * Stops the server and forgets all registered pages.
     */
    stop() {
        const me = this;

        me.pages.clear();
        me._starting = null;

        if (me.server) {
            me.server.close();
            me.server.closeAllConnections();
            me.server = null;
        }
    }

    /**
     * Registers HTML and returns a URL it is available at, until it is {@link #function-remove removed}.
     * @param {String} html
     * @returns {Promise<String>}
     */
    async add(html) {
        const me = this;

        await me.start();

        const id = randomUUID();

        // Client might send no html for a page
        me.pages.set(id, html == null ? '' : String(html));

        return `http://${HOST}:${me.server.address().port}/${id}`;
    }

    /**
     * Removes HTML registered under the given URL.
     * @param {String} url URL returned from {@link #function-add}
     */
    remove(url) {
        this.pages.delete(url.slice(url.lastIndexOf('/') + 1));
    }

    handleRequest(req, res) {
        const html = req.method === 'GET' ? this.pages.get(req.url.slice(1)) : undefined;

        // Browser requests an icon for every page it is navigated to. Not found response is reported to the page
        // console as an error and ends up in the server log.
        if (req.method === 'GET' && req.url === '/favicon.ico') {
            res.writeHead(204);
            res.end();
        }
        else if (html === undefined) {
            res.writeHead(404);
            res.end();
        }
        else {
            res.writeHead(200, {
                'Content-Type'  : 'text/html; charset=utf-8',
                'Cache-Control' : 'no-store'
            });
            res.end(html);
        }
    }
}

module.exports = { PageHost };
