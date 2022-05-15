/**
 * This script reports how much time it takes on average to export few HTML pages. Use it before upgrading puppeteer.
 */
const puppeteer = require('puppeteer');
const version = require('puppeteer/package.json').version;
const fs = require('fs');

class Server {
    async setup() {
        if (!this.browser) {
            this.browser = await puppeteer.launch();
        }

        const config = JSON.parse(fs.readFileSync('./__tests__/samples/parallel/data.json', 'utf-8'));

        if (config) {
            this.pages = config.html;
        }
        else {
            console.error('Cannot find content to export')
            process.exit(1);
        }
    }

    async export() {
        const me = this;

        console.log(`Checking puppeteer version ${version}`);

        try {
            await this.setup();

            const page = await me.browser.newPage();

            page.on('error', e => {
                throw e;
            });

            const start = new Date();

            for (const item of this.pages) {
                await page.setContent(item, { waitUntil : 'networkidle0' });

                await page.emulateMediaType('print');

                await page.pdf({
                    printBackground : true,
                    margin : {
                        top    : 0,
                        bottom : 0,
                        left   : 1,
                        right  : 1
                    },
                    format: 'a4'
                });
            }

            const end = new Date();

            console.log(`Export took ${end - start}ms, ${(end - start) / this.pages.length}ms per page`);

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
