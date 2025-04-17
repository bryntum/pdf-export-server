const generate = require('nanoid/generate');

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

module.exports = {
    getId : () => generate(alphabet, 21)
}
