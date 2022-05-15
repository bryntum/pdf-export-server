/**
 * It appears we can get rid of hummus if we update exporter to put content to a single page. This test uses HTML
 * crafted from genuine export request and it exports well.
 * We didn't use this approach before because when printing to PDF content used get shifted.
 * TODO:
 * 1. update puppeteer to latest version
 * 2. try this test with latest puppeteer
 * 3. if 2 succeeds, update client to put all content to a single page with `page-break-after` style
 */
const puppeteer = require('puppeteer');
const fs = require('fs');

class Server {
    async setup() {
        if (!this.browser) {
            this.browser = await puppeteer.launch();
        }

        this.content = fs.readFileSync('paging-test-2.html', 'utf-8');
    }

    async export() {
        const me = this;

        try {
            await this.setup();

            const page = await me.browser.newPage();

            page.on('error', e => {
                throw e;
            });

            await page.setContent(me.content, { waitUntil : 'networkidle0' });

            await page.emulateMediaType('print');

            await page.pdf({
                path: 'paging-test-2.pdf',
                printBackground : true,
                margin : {
                    top    : 0,
                    bottom : 0,
                    left   : 1,
                    right  : 1
                },
                format: 'a4'
            });

            await me.browser.close();

            console.log('browser closed');
        }
        catch (e) {
            await me.browser.close();

            throw e;
        }
    }
}

const srv = new Server();

srv.export()
.then(() => process.exit())
.catch(e => {
    console.log(e);

    process.exit(1);
});
