/**
 * Tests for the page host: local server which gives exported HTML to the browser. Also verifies that the
 * server does not navigate browser to a URL provided by the client (`clientURL` request field is ignored).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const { PageHost } = require('../../src/PageHost.js');
const { Worker } = require('../../src/queue.js');
const ExportServer = require('../../src/server/ExportServer.js');
const { createExportServer, stopExportServer, streamToBuffer, getLoggerConfig, getPort } = require('../utils.js');

jest.setTimeout(60 * 1000);

function request(url, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method }, res => {
            let body = '';

            res.setEncoding('utf8');
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status : res.statusCode, headers : res.headers, body }));
        });

        req.on('error', reject);
        req.end();
    });
}

describe('PageHost', () => {
    let pageHost;

    beforeEach(() => {
        pageHost = new PageHost();
    });

    afterEach(() => {
        pageHost.stop();
    });

    test('Should serve registered html on the loopback interface under a generated name', async () => {
        const
            html = '<!DOCTYPE html><html><body>Тест</body></html>',
            url  = await pageHost.add(html);

        expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]{36}$/);
        expect(pageHost.server.address().address).toBe('127.0.0.1');

        const response = await request(url);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(response.body).toBe(html);
    });

    test('Should generate a unique url for every page', async () => {
        const
            url1 = await pageHost.add('<p>1</p>'),
            url2 = await pageHost.add('<p>1</p>');

        expect(url1).not.toBe(url2);
        expect((await request(url1)).body).toBe('<p>1</p>');
        expect((await request(url2)).body).toBe('<p>1</p>');
    });

    test('Should return nothing but registered pages', async () => {
        const
            url  = await pageHost.add('<p>secret</p>'),
            base = url.slice(0, url.lastIndexOf('/'));

        for (const path of ['/', '/unknown', '/../package.json', '/%2e%2e/package.json', `${new URL(url).pathname}/`, `${new URL(url).pathname}?a=1`]) {
            const response = await request(base + path);

            expect(response.status).toBe(404);
            expect(response.body).toBe('');
        }

        // Only GET is supported
        for (const method of ['POST', 'PUT', 'DELETE']) {
            expect((await request(url, method)).status).toBe(404);
        }

        // Browser asks for the icon on every navigation, it gets an empty response to not pollute the log
        const favicon = await request(`${base}/favicon.ico`);

        expect(favicon.status).toBe(204);
        expect(favicon.body).toBe('');

        expect((await request(url)).status).toBe(200);
    });

    test('Should not serve removed page', async () => {
        const url = await pageHost.add('<p>1</p>');

        pageHost.remove(url);

        expect(pageHost.pages.size).toBe(0);
        expect((await request(url)).status).toBe(404);
    });

    test('Should serve empty document when there is no html', async () => {
        const response = await request(await pageHost.add(undefined));

        expect(response.status).toBe(200);
        expect(response.body).toBe('');
    });

    test('Should use configured port', async () => {
        const port = getPort();

        pageHost = new PageHost({ port });

        const url = await pageHost.add('<p>1</p>');

        expect(new URL(url).port).toBe(String(port));
        expect(pageHost.server.address().port).toBe(port);
        expect((await request(url)).body).toBe('<p>1</p>');
    });

    test('Should report configured port which is not available', async () => {
        // Take the port
        const url = await pageHost.add('<p>1</p>');

        const other = new PageHost({ port : pageHost.server.address().port });

        await expect(other.add('<p>2</p>')).rejects.toThrow(/page-port.*EADDRINUSE/);

        // First host is not affected, second one works when port gets free
        expect((await request(url)).body).toBe('<p>1</p>');

        pageHost.stop();

        expect((await request(await other.add('<p>2</p>'))).body).toBe('<p>2</p>');

        other.stop();
    });

    test('Should start again after being stopped', async () => {
        const url = await pageHost.add('<p>1</p>');

        pageHost.stop();

        await expect(request(url)).rejects.toThrow();

        expect((await request(await pageHost.add('<p>2</p>'))).body).toBe('<p>2</p>');
    });
});

describe('Loading html to the page', () => {
    let exportServer, pageHost, clientServer;

    afterEach(async () => {
        if (exportServer) {
            stopExportServer(exportServer);
            exportServer = null;
        }

        if (pageHost) {
            pageHost.stop();
            pageHost = null;
        }

        if (clientServer) {
            await new Promise(resolve => clientServer.close(resolve));
            clientServer = null;
        }
    });

    test('Should remove html from the page host when page failed to load', async () => {
        pageHost = new PageHost();

        const
            worker = new Worker({ pageHost }),
            urls   = [],
            page   = {
                goto(url) {
                    urls.push(url);
                    return Promise.reject(new Error('Navigation failed'));
                }
            };

        await expect(worker.loadHtml(page, '<p>1</p>')).rejects.toThrow('Navigation failed');

        expect(urls.length).toBe(1);
        expect(pageHost.pages.size).toBe(0);
        expect((await request(urls[0])).status).toBe(404);
    });

    // HTML comes from the client, it must not be able to pull files of the server into the exported document.
    // Every case tries to get content of a local file to the page in a different way.
    describe('Should not let exported html read local files', () => {
        const
            SECRET  = 'LOCAL-FILE-SECRET-7f3a',
            CONTROL = 'CONTROL-MARKER-91c2';

        let tmpDir, fileUrl, loadHtmlSpy, pageTexts;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-export-test-'));

            const secretPath = path.join(tmpDir, 'secret.html');

            fs.writeFileSync(secretPath, `<html><body>${SECRET}</body></html>`);

            fileUrl = pathToFileURL(secretPath).href;

            pageTexts = [];

            // Collect text of the page and all its frames right after html is loaded, that is what gets exported
            const loadHtml = Worker.prototype.loadHtml;

            loadHtmlSpy = jest.spyOn(Worker.prototype, 'loadHtml').mockImplementation(async function(page, html) {
                await loadHtml.call(this, page, html);

                for (const frame of page.frames()) {
                    pageTexts.push(await Promise.race([
                        frame.evaluate(() => document.documentElement.innerText).catch(() => ''),
                        // A frame which was not allowed to load has no document to evaluate in on some platforms,
                        // puppeteer waits for it until timeout
                        new Promise(resolve => setTimeout(resolve, 1000, ''))
                    ]));
                }
            });
        });

        afterEach(() => {
            loadHtmlSpy.mockRestore();
            fs.rmSync(tmpDir, { recursive : true, force : true });
        });

        test.each([
            ['iframe', url => `<iframe src="${url}"></iframe>`],
            ['object', url => `<object data="${url}" type="text/html"></object>`],
            ['embed', url => `<embed src="${url}" type="text/html">`],
            ['fetch', url => `<p id="out"></p><script>
                fetch("${url}").then(r => r.text()).then(t => document.getElementById("out").textContent = t, () => {});
            </script>`],
            ['XMLHttpRequest', url => `<p id="out"></p><script>
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open("GET", "${url}", false);
                    xhr.send();
                    document.getElementById("out").textContent = xhr.responseText;
                }
                catch (e) {}
            </script>`],
            ['navigation', url => `<script>location.href = "${url}";</script>`]
        ])('using %s', async (name, getMarkup) => {
            exportServer = createExportServer({
                workers : 1,
                logger  : getLoggerConfig('queue_page_host_local_files')
            });

            const requestData = {
                // Frame with a known content proves that frames content is collected
                html        : [{ html : `<html><body><iframe srcdoc="<p>${CONTROL}</p>"></iframe>${getMarkup(fileUrl)}</body></html>` }],
                orientation : 'portrait',
                format      : 'A4',
                fileFormat  : 'pdf'
            };

            const buffer = await streamToBuffer(await exportServer.exportRequestHandler(requestData, `test-local-file-${name}`));

            expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');

            const text = pageTexts.join('\n');

            expect(text).toContain(CONTROL);
            expect(text).not.toContain(SECRET);
        });
    });

    test('Should load page from the port set with "page-port" config', async () => {
        const port = getPort();

        exportServer = new ExportServer({
            'max-workers' : 1,
            'page-port'   : port,
            logger        : getLoggerConfig('queue_page_host_port'),
            chromiumArgs  : ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const origins = [];

        // Page reports its origin to the console, which worker forwards to the log
        exportServer.taskQueue.on('log', ({ message }) => {
            const match = /PAGE-ORIGIN (\S+)/.exec(message);

            match && origins.push(match[1]);
        });

        const requestData = {
            html        : [{ html : '<html><body><script>console.log("PAGE-ORIGIN " + location.origin);</script></body></html>' }],
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf'
        };

        const buffer = await streamToBuffer(await exportServer.exportRequestHandler(requestData, 'test-page-port'));

        expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');
        expect(origins).toEqual([`http://127.0.0.1:${port}`]);
    });

    test('Should load page from the page host and ignore clientURL sent by the client', async () => {
        let clientRequests = 0;

        // This plays a role of a URL which client wants server to navigate to
        clientServer = http.createServer((req, res) => {
            clientRequests++;
            res.end('<html><body></body></html>');
        });

        await new Promise(resolve => clientServer.listen(0, '127.0.0.1', resolve));

        exportServer = createExportServer({
            workers : 1,
            logger  : getLoggerConfig('queue_page_host')
        });

        const
            { pageHost } = exportServer.taskQueue,
            add          = pageHost.add.bind(pageHost),
            urls         = [];

        pageHost.add = async html => {
            const url = await add(html);
            urls.push(url);
            return url;
        };

        const requestData = {
            // Page reports its own address by rendering it, same address is requested from the client server
            html        : [{ html : `<html><body><script>document.title = location.origin;</script><p>test</p></body></html>` }],
            orientation : 'portrait',
            format      : 'A4',
            fileFormat  : 'pdf',
            clientURL   : `http://127.0.0.1:${clientServer.address().port}/`
        };

        const buffer = await streamToBuffer(await exportServer.exportRequestHandler(requestData, 'test-page-host'));

        expect(buffer.slice(0, 4).toString('utf8')).toBe('%PDF');

        // Server did not navigate to the client url
        expect(clientRequests).toBe(0);

        // Page was loaded from the page host and removed from it after
        expect(urls.length).toBe(1);
        expect(urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]{36}$/);
        expect(pageHost.pages.size).toBe(0);
    });
});
