// Maps PDF_EXPORT_* environment variables onto the app config. Numbers must be
// positive integers; anything else keeps the config's existing value.
const NUMERIC = {
    PDF_EXPORT_MAX_WORKERS : 'max-workers',
    PDF_EXPORT_TIMEOUT     : 'timeout',
    PDF_EXPORT_MAX_PAGES   : 'max-pages',
    PDF_EXPORT_MAX_QUEUE   : 'max-queue'
};

const STRINGS = {
    PDF_EXPORT_MAXIMUM    : 'maximum',
    PDF_EXPORT_CORS       : 'cors',
    PDF_EXPORT_LOG_FORMAT : 'log-format'
};

function applyEnv(config, env = process.env) {
    for (const [name, key] of Object.entries(NUMERIC)) {
        const value = Number.parseInt(env[name], 10);
        if (Number.isInteger(value) && value > 0) {
            config[key] = value;
        }
    }
    for (const [name, key] of Object.entries(STRINGS)) {
        if (env[name]) {
            config[key] = env[name];
        }
    }
    return config;
}

module.exports = { applyEnv };
