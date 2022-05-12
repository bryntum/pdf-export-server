const Getopt = require('node-getopt');
const smokeTest = require('./smoke.js');
const parallelTest = require('./parallel.js');
const parallelTest2 = require('./parallel2.js');
const failingWorkerTest = require('./failing_worker.js');
const fileProtocolTest = require('./fileprotocol.js');
const { status } = require('./utils.js');

const getopt = new Getopt([
    ['',    'workers=WORKERS'   , 'Maximum amount of workers (tabs or browsers)'],
    ['',    'port=PORT'         , 'Port for server to use']
]);

getopt.setHelp(
    'Usage: node tests/index.js [OPTION]\n' +
    '\n' +
    '[[OPTIONS]]\n'
);

const { options } = getopt.parse(process.argv.slice(2));

(async function() {
    try {
        await smokeTest.run(options);
        await parallelTest.run(options);
        await parallelTest2.run(options);
        await failingWorkerTest.run(options);
        await fileProtocolTest.run(options);

        if (status.failedAssertions) {
            console.error(`There are ${status.failedAssertions} failed assertions`);
            process.exit(1);
        }
    }
    catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
})().then(() => {
    process.exit();
});
