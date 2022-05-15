const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

let loggers = {};

let loggerInstance;

module.exports = {
    getLogger(config = {}) {
        let result;

        const hash = JSON.stringify(config);

        if (hash in loggers) {
            result = loggers[hash];
        }
        else {
            const { combine, timestamp, printf } = format;

            const myFormat = printf(({ level, message, timestamp }) => {
                return `${timestamp} ${level}: ${message}`;
            });

            let transport;

            if (config && config.rotate) {
                transport = new transports.DailyRotateFile(config.rotate);
            }
            else if (config && config.file) {
                transport = new transports.File(config.file);
            }
            else {
                transport = new transports.Console();
            }

            loggers[hash] = result = createLogger(Object.assign({
                format: combine(
                    timestamp(),
                    myFormat
                ),
                transports: [
                    transport
                ]
            }, config || {}));

            // Log unhandled promise rejections
            process.on('unhandledRejection', e => {
                result.error(e.error && e.error.stack || e.stack || e.message);
            });

            // Override the base console log with winston
            const clog = console.log;
            console.log = function(...args) {
                result.info(...args);
                clog.apply(console, args);
            };
        }

        return result;
    }
};
