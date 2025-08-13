const muhammara = require('muhammara');
const stream = require('stream');
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
     * Concatenate an array of PDF buffers and return the combined result. This function uses the muhammara package, a
     * copy the muhammara binary is delivered next to the executable.
     *
     * @param {Uint8Array[]} pdfs
     * @returns {Promise<module:stream.internal.PassThrough>}
     */
    async combinePdfBuffers(pdfs) {
        const outStream = new memoryStreams.WritableStream();

        try {
            const
                first     = pdfs.shift(),
                firstPage = new muhammara.PDFRStreamForBuffer(first),
                pdfWriter = muhammara.createWriterToModify(firstPage, new muhammara.PDFStreamForResponse(outStream));

            let next = pdfs.shift();

            while (next) {
                const nextPage = new muhammara.PDFRStreamForBuffer(next);
                pdfWriter.appendPDFPagesFromPDF(nextPage);
                next = pdfs.shift();
            }

            pdfWriter.end();
            outStream.end();

            const result = new stream.PassThrough();
            result.end(outStream.toBuffer());

            return result;
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
     * @returns {Promise<module:stream.internal.PassThrough>}
     */
    async combinePngBuffers(pngs) {
        return new Promise((resolve, reject) => {
            mergeImg(pngs, { direction : true }).then(img => {
                img.getBuffer('image/png', (s, buf) => {
                    const result = new stream.PassThrough();
                    result.end(buf);
                    resolve(result);
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
     * @param requestData
     * @param requestId UUID of the request
     * @param [emitter] Event emitter. Entity which monitors connection status to dequeue jobs
     * @returns {Promise<Stream>}
     */
    async exportRequestHandler(requestData, requestId, emitter) {
        const
            { html, orientation, format, fileFormat, clientURL } = requestData,
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

            // dimensions can be set in format 12in*14in. This has precedence over A4, Letter etc
            if (dimension.length === 2) {
                config.width = /in/.test(dimension[0]) ? dimension[0] : parseInt(dimension[0], 10);
                config.height = /in/.test(dimension[1]) ? dimension[1] : parseInt(dimension[1], 10);
                config.pageRanges = '1-1';
            }
            else {
                config.format = format;
                config.landscape = landscape;
            }

            const me = this;

            const onClose = () => me.taskQueue.dequeue(requestId);

            emitter?.on('close', onClose);

            const files = await this.taskQueue.queue({ requestId, items : html.map(i => i.html), config });

            emitter?.off('close', onClose);

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
                me.logger.log('error', 'No files found');
            }
        }
    }
};
