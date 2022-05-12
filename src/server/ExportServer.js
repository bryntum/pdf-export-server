const hummus = require('hummus');
const memoryStreams = require('memory-streams');
const mergeImg = require('merge-img');
const { Queue } = require('../queue.js');
const { getLogger } = require('../logger.js');

module.exports = class ExportServer {
    constructor(config) {
        const { tabs, chromiumArgs, chromiumExecutablePath, logger, testing, quick } = config;

        this.taskQueue = new Queue({
            maxWorkers : config['max-workers'],
            useTabs    : Boolean(tabs),
            chromiumArgs,
            chromiumExecutablePath,
            quick,
            testing
        });

        this.logger = getLogger(logger);

        this.taskQueue.on('log', ({ level, message, id, label }) => {
            this.logger.log(level, `[${label}@${id}] ${message}`);
        });
    }

    /**
     * Concatenate an array of PDF buffers and return the combined result. This function uses the hummus package, a
     * copy the hummus binary is delivered next to the executable.
     *
     * @param {Buffer[]} pdfs
     * @returns {Promise<Buffer>}
     */
    async combinePdfBuffers(pdfs) {
        const outStream = new memoryStreams.WritableStream();

        try {
            if (pdfs.length === 1) {
                return pdfs[0];
            }

            const
                first     = pdfs.shift(),
                firstPage = new hummus.PDFRStreamForBuffer(first),
                pdfWriter = hummus.createWriterToModify(firstPage, new hummus.PDFStreamForResponse(outStream));

            let next = pdfs.shift();

            while (next) {
                const nextPage = new hummus.PDFRStreamForBuffer(next);
                pdfWriter.appendPDFPagesFromPDF(nextPage);
                next = pdfs.shift();
            }

            pdfWriter.end();
            const mergedBuffer = outStream.toBuffer();
            outStream.end();

            return mergedBuffer;
        }
        catch (err) {
            outStream.end();
            throw err;
        }
    }

    /**
     * Concatenate an array of Png buffers and return the combined result.
     *
     * @param pngs
     * @returns {Promise<Buffer>}
     */
    async combinePngBuffers(pngs) {
        return new Promise((resolve, reject) => {
            mergeImg(pngs, { direction : true }).then(img => {
                img.getBuffer('image/png', (s, buf) => {
                    resolve(buf);
                });
            }).catch(err => reject(err));
        });
    }

    /**
     * Main entry to process an export request. The format of the request object should be:
     *
     * request
     *  - format: like A4
     *  - fileFormat: pdf | png
     *  - html: an array of html fragments (Strings).
     *      - html (this contains the fragment)
     *      - column
     *      - row
     *      - rowsHeight
     *      - number
     *  - range: like 'complete'
     *  - orientation : landscape | portrait
     *
     * @param request
     * @param requestId UUID of the request
     * @returns {Promise<Buffer>}
     */
    async exportRequestHandler(request, requestId) {
        const
            { html, orientation, format, fileFormat, clientURL } = request,
            landscape                                            = orientation === 'landscape';

        if (!html) {
            throw new Error('No html fragments found');
        }
        else {
            const
                config = {
                    clientURL,
                    fileFormat
                },
                dimension = format.split('*');

            //format can be send in format 12in*14in. This has precedence over A4, Letter et cetera
            if (dimension.length === 2) {
                config.width = dimension[0];
                config.height = dimension[1];
                config.pageRanges = '1-1';
            }
            else {
                config.format = format;
                config.landscape = landscape;
            }

            const files = await this.taskQueue.queue({ requestId, items : html.map(i => i.html), config });

            //All buffers are stored in the files object, we need to concatenate them
            if (files.length) {
                let result;

                switch (fileFormat) {
                    case 'pdf':
                        result = await this.combinePdfBuffers(files);
                        break;
                    case 'png':
                        result = await this.combinePngBuffers(files);
                        break;
                }

                return result;
            }
            else {
                throw new Error('Something went wrong: no files');
            }
        }
    }
};
