const { createLogger, format, transports : winstonTransports } = require('winston');
require('winston-daily-rotate-file');

let loggers = {};

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

            const transports = [new winstonTransports.Console({ level : 'error' })];

            if (config?.rotate) {
                transports.push(new winstonTransports.DailyRotateFile(config.rotate));
            }
            else if (config?.file) {
                transports.push(new winstonTransports.File(config.file));
            }

            loggers[hash] = result = createLogger({
                format: combine(
                    timestamp(),
                    myFormat
                ),
                transports,
                ...config
            });

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
