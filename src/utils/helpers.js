const { customAlphabet } = require('nanoid');

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const getId = customAlphabet(alphabet, 21);

module.exports = {
    getId: getId
}
