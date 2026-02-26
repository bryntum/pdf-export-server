/**
 * Jest global setup - runs once before all tests.
 * Starts the static resource server.
 */
const { startStaticServer } = require('./staticServer.js');

module.exports = async () => {
    await startStaticServer();
};
