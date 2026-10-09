const { MESSAGE } = require('triple-beam');
const { getLogger } = require('../../src/logger.js');

test('json mode emits exactly one pure JSON line per console.log and no raw text line', () => {
    const originalLog = console.log;
    const rawLog = jest.fn();
    const lines = [];
    let logger;

    console.log = rawLog;

    try {
        logger = getLogger({ 'log-format' : 'json' });
        jest.spyOn(logger.transports[0], 'log').mockImplementation((info, next) => {
            lines.push(info[MESSAGE]);
            next();
        });
        console.log('hello');
    }
    finally {
        console.log = originalLog;
    }

    expect(rawLog).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).message).toBe('hello');
});
