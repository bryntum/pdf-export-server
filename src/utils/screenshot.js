/**
 * This is a test page to check how puppeteer manage to take a screenshot with height 25000px.
 * Works outside of webserver, throws exceptions inside it.
 *
 * Reported here: https://github.com/puppeteer/puppeteer/issues/5341
 */
const puppeteer = require('puppeteer');

class Server {
    async setup() {
        if (!this.browser) {
            this.browser = await puppeteer.launch();
        }
    }

    async export() {
        try {
            await this.setup();

            const me = this;

            const page = await this.browser.newPage();

            page.on('error', e => {
                throw e;
            });

            await page.setContent('<html><head></head><body><h1>test</h1></body></html>');

            await page.setViewport({
                width : 10000,
                height : 50000
            });
            await page.emulateMedia('print');

            await page.screenshot({
                deviceScaleFactor : 4
            });

            await this.browser.close();

            console.log('browser closed');
        }
        catch (e) {
            await this.browser.close();

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
