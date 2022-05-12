const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

let loggerInstance;

module.exports = {
    getLogger(config = {}) {
        let result;

        if (loggerInstance !== undefined) {
            result = loggerInstance;
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
            else {
                transport = new transports.Console();
            }

            result = loggerInstance = createLogger(Object.assign({
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
                loggerInstance.info(...args);
                clog.apply(console, args);
            };
        }

        return result;
    }
};
