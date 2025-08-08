const { customAlphabet } = require('nanoid');

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

module.exports = {
    getId : () => customAlphabet(alphabet, 21)
}
