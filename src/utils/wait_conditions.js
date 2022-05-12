const puppeteer = require('puppeteer');
const fs = require('fs');

const signals = ['null', 'load', 'domcontentloaded', 'networkidle0', 'networkidle2'];
const pages = new Array(signals.length).fill('<!DOCTYPE html><html><header></header><body><div>Hello world</div></body></html>');

class Server {
    async setup() {
        if (!this.browser) {
            this.browser = await puppeteer.launch();
        }
    }

    async export() {
        await this.setup();

        for (let i = 0, l = pages.length; i < l; i++) {
            const signal = signals[i];

            console.time(signal);

            const page = await this.browser.newPage();

            console.log(`Wait trigger: ${signal}`);

            console.time('bryntum');
            await page.goto('http://dev.bryntum.com/examples/grid-vanilla/examples/export/index.html', signal === 'null' ? undefined : { waitUntil : signal });
            console.timeEnd('bryntum');

            // console.time('goto');
            // await page.goto('about:blank', signal === 'null' ? undefined : { waitUntil : signal });
            // console.timeEnd('goto');
            //
            // console.time('setContent');
            // await page.setContent(pages[i], signal === 'null' ? undefined : { waitUntil : signal });
            // console.timeEnd('setContent');

            console.time('Pdf');
            await page.emulateMedia('print');
            const buffer = await page.pdf();
            console.timeEnd('Pdf');

            fs.writeFileSync(`${signal}.pdf`, buffer);

            await page.close();
            console.timeEnd(signal);
        }
    }
}

const srv = new Server();

srv.export().then(() => process.exit());
