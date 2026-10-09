const { checkLimits } = require('../../src/server/limits.js');

describe('checkLimits', () => {
    test('accepts a request within both limits', () => {
        expect(checkLimits({ pages : 10, pending : 3, maxPages : 500, maxQueue : 20 })).toBeNull();
    });

    test('refuses too many pages with 413 TOO_MANY_PAGES', () => {
        expect(checkLimits({ pages : 501, pending : 0, maxPages : 500, maxQueue : 20 })).toEqual({
            status : 413,
            body   : { success : false, code : 'TOO_MANY_PAGES', msg : 'Export has 501 pages, the limit is 500' }
        });
    });

    test('refuses a full queue with 503 and Retry-After', () => {
        expect(checkLimits({ pages : 1, pending : 20, maxPages : 500, maxQueue : 20 })).toEqual({
            status  : 503,
            headers : { 'Retry-After' : '10' },
            body    : { success : false, code : 'QUEUE_FULL', msg : '20 exports are already pending, retry later' }
        });
    });

    test('treats a missing html array as zero pages', () => {
        expect(checkLimits({ pages : 0, pending : 0, maxPages : 500, maxQueue : 20 })).toBeNull();
    });
});
