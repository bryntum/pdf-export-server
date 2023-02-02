const { EventEmitter } = require('events');
const puppeteer = require('puppeteer');
const generate = require('nanoid/generate');
const { RequestCancelError } = require('./exception.js');

const
    alphabet         = '0123456789abcdefghijklmnopqrstuvwxyz',
    // Also defined in commands.js
    MAX_WORKERS      = 5,
    // Max amount of fails allowed before rejecting request
    MAX_FAILS        = 3,
    // This is used for testing purposes only
    FAIL_PROBABILITY = 0.4,
    // Timeout in ms before destroying the worker
    IDLE_TIMEOUT     = 2000;

function getId() {
    return generate(alphabet, 21);
}

// https://pptr.dev/#?product=Puppeteer&version=v2.0.0&show=api-pagepdfoptions
const paperFormat = {
    letter  : { width : 8.5, height : 11 },
    legal   : { width : 8.5, height : 14 },
    tabloid : { width : 11, height : 17 },
    ledger  : { width : 17, height : 11 },
    a0      : { width : 33.1, height : 46.8 },
    a1      : { width : 23.4, height : 33.1 },
    a2      : { width : 16.54, height : 23.4 },
    a3      : { width : 11.7, height : 16.54 },
    a4      : { width : 8.27, height : 11.7 },
    a5      : { width : 5.83, height : 8.27 },
    a6      : { width : 4.13, height : 5.83 }
};

function inchToPx(value, round = true) {
    // 1in = 96px for screens
    // https://developer.mozilla.org/en-US/docs/Web/CSS/length#Absolute_length_units
    let result = value * 96;

    if (round) {
        result = Math.round(result);
    }

    return result;
}

function orderMapValuesByKey(map) {
    // Number(...) - Explicit is better than implicit
    const keys = Array.from(map.keys()).sort((a, b) => Number(a) - Number(b));

    return keys.map(key => map.get(key));
}

class ObservableSet extends EventEmitter {
    constructor() {
        super();

        this.values = new Set();
    }

    get isEmpty() {
        return this.size === 0;
    }

    get first() {
        return this.values.values().next().value;
    }

    get size() {
        return this.values.size;
    }

    add(value) {
        this.values.add(value);

        this.emit('add');
    }

    delete(value) {
        this.values.delete(value);

        this.emit('delete');

        if (this.isEmpty) {
            this.emit('empty');
        }
    }
}

class Loggable extends EventEmitter {
    constructor(props) {
        super(props);
        this.label = this.constructor.name;
        this.id = getId();

        this.on('error', e => {
            this.error(e);
        });
    }

    verbose(message) {
        this.log('verbose', message);
    }

    info(message) {
        this.log('info', message);
    }

    warn(message) {
        this.log('warn', message);
    }

    error(e) {
        this.log('error', e.error && e.error.stack || e.stack || e.message || e);
    }

    log(level, message, label = this.label, id = this.id) {
        this.emit('log', { level, message, label, id });
    }
}

class Queue extends Loggable {
    constructor({ maxWorkers = MAX_WORKERS, useTabs = false, chromiumExecutablePath, chromiumArgs = [], quick = false, testing = false }) {
        super();
        const me = this;

        me.maxWorkers = Number(maxWorkers);
        me.useTabs = useTabs;

        // Boolean flag to use quick loading (waitUntil load). Makes pages to export faster, fonts might be missing.
        me.quick = quick;

        // Used to switch queue to testing mode
        me.testing = testing;

        // List of html chunks to convert to pdf/png
        me.jobs = [];

        // Jobs can fail and get restarted, each job output is stored here grouped by request id
        me._results = {};

        // Number of iterators awaiting for available worker
        me._awaitingActions = 0;

        me.workers = new ObservableSet();
        me.workers.on('empty', () => {
            // This branch is never expected to get triggered. If this message appears in the log it means that queue
            // life cycle is not optimal - it waited for about [2, 2*workers] seconds to continue. Queue will be restarted.
            if (me.jobs.length) {
                me.warn(`All workers were destroyed, but there are ${me.jobs.length} items in the queue. Restarting.`);

                if (me._running) {
                    me.next();
                }
                else {
                    me.start();
                }
            }
            else {
                me.info('All workers destroyed, queue is empty');

                if (me._browser) {
                    me.info('Stopping browser');
                    me._browser.close();
                    delete me._browser;
                }
            }
        });

        me.availableWorkers = new ObservableSet();
        me.availableWorkers.on('add', () => {
            if (me.availableWorkers.size === me.workers.size && me.jobs.length === 0) {
                me.emit('stop');
            }
        });

        // This is a factory method, returning instance of the browser. It is passed to worker class constructor, so
        // it cannot refer to the instance.
        me.startPuppeteer = async function(scope) {
            const browser = await puppeteer.launch({ ignoreHTTPSErrors : true, executablePath : chromiumExecutablePath, args : chromiumArgs });

            scope.verbose('Browser started');

            browser.on('disconnected', function() {
                scope.verbose('Browser disconnected');
            });

            return browser;
        };
    }

    // Each request might have multiple jobs related to it (one per page). There could be a case when one worker is
    // failing too much, eventually skipping the job and failing the request, but the queue is still running.
    // In such case we don't need to actually run anything, just pick job from the list and see if that job should be executed
    shouldContinueJob(requestId) {
        return Object.prototype.hasOwnProperty.call(this._results, requestId);
    }

    async getWorker() {
        const me = this;

        let worker;

        if (me.availableWorkers.isEmpty && me.workers.size < me.maxWorkers) {
            worker = new Worker({
                browser        : me._browser,
                quick          : me.quick,
                testing        : me.testing,
                browserFactory : me.startPuppeteer
            });

            me.workers.add(worker);
            me.availableWorkers.add(worker);

            // Forward logging events from worker
            worker.on('log', ({ level, message, label, id }) => me.log(level, message, label, id));

            // Hack: trigger message from the queue (not constructor), after event is forwarded for outside logger to process
            worker.verbose('New worker created');

            worker.on('start', () => me.availableWorkers.delete(worker));
            worker.on('end', () => me.availableWorkers.add(worker));
            worker.on('idle', () => {
                me.availableWorkers.delete(worker);
                me.workers.delete(worker);
            });
        }
        else if (!me.availableWorkers.isEmpty) {
            worker = me.availableWorkers.first;
        }
        else {
            await new Promise(resolve => {
                me.availableWorkers.once('add', resolve);
            });
            worker = await me.getWorker();
        }

        return worker;
    }

    /**
     * Adds items to the queue and starts it (if it is not working yet). Returns promise which is resolved when
     * all the passed htmls are processed, or rejected if there was an error in the export process.
     * @param {Object} params
     * @param {String} params.requestId
     * @param {String[]} params.items HTML to convert to PDF/PNG
     * @param {Object} params.config
     * @returns {Promise<Buffer[]>}
     */
    async queue({ requestId, items, config }) {
        const me = this;

        return new Promise((resolve, reject) => {
            const length = items.length;

            me.jobs.push(...items.map((html, index) => {
                return {
                    requestId,
                    html,
                    config,
                    index,
                    length
                };
            }));

            // Create a map for job results (they might be out of order)
            me._results[requestId] = new Map();

            me.info(`Added ${items.length} to the queue, current length is ${me.jobs.length}`);

            function detachListeners() {
                me.removeListener('job', onJob);
                me.removeListener('jobfailed', onJobFailed);
                me.removeListener('jobcancel', onJobCancel);
            }

            function onJobFailed(id) {
                if (id === requestId) {
                    detachListeners();

                    reject(new Error('Failed to export task'));
                }
            }

            function onJob(id, result) {
                if (id === requestId) {
                    detachListeners();

                    resolve(result);
                }
            }

            function onJobCancel() {
                detachListeners();

                delete me._results[requestId];

                reject(new RequestCancelError(`Request ${requestId} is cancelled by the client`));
            }

            me.on('job', onJob);
            me.on('jobfailed', onJobFailed);
            me.on('jobcancel', onJobCancel);

            // If queue is running now and there is no awaiting action that will continue the queue,
            // call next() immediately to start job
            if (me._running && me._awaitingActions === 0) {
                me.next();
            }
            // If queue is not running, start it
            else if (!me._running) {
                me.start();
            }
        });
    }

    dequeue(requestId) {
        this.emit('jobcancel', requestId);
    }

    start() {
        this._activeRun = this.run();

        this._activeRun.then(() => {
            delete this._activeRun;
        });
    }

    async run() {
        const me = this;

        me._running = true;

        me.info('Queue is running');

        if (me.useTabs && !me._browser) {
            // Apparently it is better to parallelize with browsers, not pages
            // https://docs.browserless.io/blog/2018/06/04/puppeteer-best-practices.html
            me._browser = await me.startPuppeteer(this);
        }

        return new Promise(resolve => {
            me.once('stop', () => {
                me.info('Queue is stopped');

                me._running = false;

                resolve();
            });

            me.next();
        });
    }

    // This method will start the job and will try to restart it in case of failures. There is a maximum number of
    // attempts (5 by default, seems reasonable).
    runJob(worker, job) {
        const me = this;

        // If one of the workers failed to execute its part of the job and reached out of retry attempts,
        // then stop any other concurrent job in progress.
        if (me.shouldContinueJob(job.requestId)) {
            // this will start async export and remove worker from availability list
            worker.run(job)
                .then(data => {
                    const results = me._results[job.requestId];

                    // Result may have been removed for the cancelled job
                    if (results) {
                        results.set(job.index, data);

                        // Last job has finished, return result
                        if (results.size === job.length) {
                            delete me._results[job.requestId];

                            me.verbose(`All jobs finished for request ${job.requestId}`);

                            const result = orderMapValuesByKey(results);

                            me.emit('job', job.requestId, result);
                        }
                    }
                })
                .catch(e => {
                    if (!Object.prototype.hasOwnProperty.call(job, 'failCount')) {
                        job.failCount = 0;
                    }

                    // Try to restart the job few times
                    if (++job.failCount <= MAX_FAILS) {
                        worker.warn(`Job ${job.index + 1}/${job.length} for request ${job.requestId} failed, restarting`);

                        me.warn(e.stack);

                        // Start new one after one second
                        setTimeout(() => {
                            me.runJob(worker, job);
                        }, 1000);
                    }
                    else {
                    // Delete field with results for this particular request, that will make queue to skip other
                    // jobs related to this request.
                        delete me._results[job.requestId];

                        worker.warn(`Job ${job.index + 1}/${job.length} for request ${job.requestId} failed after ${MAX_FAILS} attempts`);

                        me.error(e);

                        // This is a promise, so throwing exception here would be treated as unhandled rejection
                        me.emit('jobfailed', job.requestId);

                        // Put worker back to list of available ones
                        me.availableWorkers.add(worker);
                    }
                });
        }
        else {
            me.verbose(`Skipping job ${job.index + 1}/${job.length} for request ${job.requestId}`);
        }
    }

    async next() {
        const me = this;

        // if there are jobs in queue - start one
        if (me.jobs.length) {
            // This flag signalizes there is one waiting queue iterator. Used by the queue() method to tell if
            // iterator should be called directly
            ++me._awaitingActions;

            // First take the worker
            // this will await for first available worker
            const worker = await me.getWorker();

            --me._awaitingActions;

            // Only after that take job from list, otherwise `stop` event will fire erroneously
            const job = me.jobs.shift();

            // Next item in queue could belong to failed request, if so - drop it
            if (me.shouldContinueJob(job.requestId)) {
                me.verbose(`Starting job ${job.index + 1}/${job.length} for request ${job.requestId}`);
                me.verbose(`${me.jobs.length} items still in queue`);

                me.runJob(worker, job);
            }
            else {
                me.verbose(`Skipping job ${job.index + 1}/${job.length} for request ${job.requestId}`);
            }

            me.next();
        }
        // queue is empty, but there might be active workers
        else if (me.availableWorkers.size === me.workers.size) {
            me.emit('stop');
        }
    }
}

class Worker extends Loggable {
    constructor(config) {
        super(config);

        const { browser, browserFactory, testing, quick } = config;

        this.browser = browser;
        this.browserFactory = browserFactory;
        this.testing = testing;

        this.waitUntil = quick ? 'load' : 'networkidle0';

        this.defaultIdleTimeout = IDLE_TIMEOUT;
    }

    onJobStart() {
        if (this.idleTimeout != null) {
            clearTimeout(this.idleTimeout);
        }
    }

    onJobDone() {
        const me = this;

        // Close tab after some idle time, if this worker wasn't called
        me.idleTimeout = setTimeout(() => {
            me.verbose(`Worker is idle, destroying`);

            if (me.browserDetacher) {
                me.verbose('Closing worker own browser');
                me.browserDetacher();
            }

            me.emit('idle');
        }, me.defaultIdleTimeout);
    }

    // Hook to override after new browser page is opened
    async onPageCreated(page) {
        page.on('console', this.handleConsoleMessage.bind(this));
    }

    handleConsoleMessage(message) {
        const text = `Page ${this.currentJobId} reports: ${message.text()}\nlocation: ${message.location().url}`;
        const type = message.type();

        switch (type) {
            case 'info':
                this.info(text);
                break;
            case 'warning':
                this.warn(text);
                break;
            case 'error':
                this.error(text);
                break;
            default:
                this.verbose(text);
        }
    }

    async run({ html, config, index, length }) {
        const me = this;

        me.emit('start');

        const _currentJobId = this.currentJobId = `${index + 1}/${length}`;

        me.onJobStart();

        me.verbose(`Started job ${_currentJobId}`);

        let browser = me.browser;

        if (!browser) {
            browser = me.browser = await me.browserFactory(this);

            me.browserDetacher = () => browser.close();
        }

        try {
            /// TESTING
            if (this.testing && Math.random() < FAIL_PROBABILITY) {
                throw new Error('Testing exception');
            }
            ///

            const page = await browser.newPage();

            await this.onPageCreated(page);

            me.verbose('Page created');

            // Rethrow error to avoid unhandled promise rejection error
            page.on('error', e => {
                throw e;
            });

            let result;

            switch (config.fileFormat) {
                case 'pdf':
                    result = await me.processPageIntoPdfBuffer(page, html, config);
                    break;
                case 'png':
                    result = await me.processPageIntoPngBuffer(page, html, config);
                    break;
            }

            await page.close();

            me.verbose('Page closed');

            me.verbose(`Finished job ${_currentJobId}`);

            me.emit('end');

            return result;
        }
        catch (e) {
            me.emit('error', e);

            throw e;
        }
        finally {
            me.onJobDone();
            me.currentJobId = null;
        }
    }

    /**
     * Creates a single PDF buffer for a passed html fragment
     * @param page
     * @param html
     * @param config
     * @returns {Promise<Buffer>}
     */
    async processPageIntoPdfBuffer(page, html, config)  {
        const me = this;

        config.printBackground = true;
        config.margin = {
            top    : 0,
            bottom : 0,
            left   : 1,
            right  : 1
        };
        config.timeout = 0;

        // NOTE: NOT SUPPORTED IN WSL
        if (config.clientURL) {
            // Navigate page to get rid of possible CORS
            try {
                await page.goto(config.clientURL, { waitUntil : 'load', referer : 'bryntum_pdf_export_server' });
            }
            catch (e) {
                // Log warning, try to continue export
                me.warn(`Unable to open client url ${config.clientURL}.\nError: ${e.message}`);
            }
        }
        else {
            // This navigation helps to set content much faster
            await page.goto('about:blank');
        }

        await page.setContent(html, { waitUntil : me.waitUntil });
        await page.emulateMediaType('print');
        return page.pdf(config);
    }

    /**
     * Creates a single PNG buffer for a passed html fragment
     * @param page
     * @param html
     * @param config
     * @returns {Promise<Buffer>}
     */
    async processPageIntoPngBuffer(page, html, config)  {
        const me = this;

        const viewportConfig = Object.assign({
            fullPage          : true,
            // https://github.com/puppeteer/puppeteer/issues/1329
            deviceScaleFactor : 4
        }, config);

        // NOTE: NOT SUPPORTED IN WSL
        if (config.clientURL) {
            // Navigate page to get rid of possible CORS
            try {
                await page.goto(config.clientURL, { waitUntil : 'load', referer : 'bryntum_pdf_export_server' });
            }
            catch (e) {
                // Log warning, try to continue export
                me.warn(`Unable to open client url ${config.clientURL}.\nError: ${e.message}`);
            }
        }
        else {
            // This navigation helps to set content much faster
            await page.goto('about:blank');
        }

        await page.setContent(html, { waitUntil : me.waitUntil });

        const contentElement = await page.$('.b-export-content');

        let contentBox;

        if (contentElement) {
            contentBox = await contentElement.boundingBox();
        }

        // If viewport size is set directly - use it
        if (viewportConfig.width) {
            if (/in/.test(viewportConfig.width)) {
                viewportConfig.width = inchToPx(parseFloat(viewportConfig.width));
                viewportConfig.height = inchToPx(parseFloat(viewportConfig.width));
            }
        }
        // if content box starts at 0,0 then we can adjust content size perfectly
        else if (contentBox && contentBox.x === 0 && contentBox.y === 0) {
            viewportConfig.width = Math.round(contentBox.width);
            viewportConfig.height = Math.round(contentBox.height);
        }
        else {
            const
                format = paperFormat[viewportConfig.format.toLowerCase()],
                width  = viewportConfig.orientation === 'portrait' ? format.width : format.height,
                height = viewportConfig.orientation === 'portrait' ? format.height : format.width;

            viewportConfig.width = inchToPx(width);
            viewportConfig.height = inchToPx(height);
        }

        me.verbose(`Taking screenshot of size ${viewportConfig.width}x${viewportConfig.height}`);

        await page.setViewport(viewportConfig);
        await page.emulateMediaType('print');
        return page.screenshot(config);
    }
}

module.exports = { Queue, Worker };
