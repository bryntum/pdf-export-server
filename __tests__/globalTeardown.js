/**
 * Jest global teardown - runs once after all tests.
 * Stops the static resource server.
 */
const { stopStaticServer } = require('./staticServer.js');

module.exports = async () => {
    await stopStaticServer();
};
