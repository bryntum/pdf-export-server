const puppeteer = require('puppeteer');
const fs = require('fs');

class Server {
    async setup() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({ args : ['--no-sandbox'] });
        }
    }

    async runner() {
        await this.setup();

        const me = this;

        this.browser.on('disconnected', function () {
            const a = me;

            console.log('pup exit code:' + this.process().exitCode);
        });

        const page = await this.browser.newPage();

        const a = 1, b = 2;

        await page.setViewport({
            width             : 50000,
            height            : 50000,
            deviceScaleFactor : 8
        });

        // page._onTargetCrashed(new Error('sim'));

        await page.goto('https://www.google.com', { waitUntil : 'networkidle0' });
        // await page.setContent('<html lang="en"><head><title>test</title><rel type="stylesheet" href="htt"></rel></head><body></body></html>', { timeout : 1, waitUntil : 'load' });

        // await page.close();

        await page.goto('http://www.bing.com', { waitUntil : 'networkidle0' });

        console.log('closing browser');

        await this.browser.close();

        console.log('browser closed');
    }

    async export() {
        try {
            await this.runner();
        }
        catch (e) {
            console.log('Page crash');

            console.error(e.stack);

            await this.browser.close();

            // await this.runner();

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
