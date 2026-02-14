const { Transform } = require('stream');

class BaseFramer extends Transform {
    constructor(options) {
        super(options);
        this.buffer = Buffer.alloc(0);
    }

    _transform(chunk, encoding, callback) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        try {
            this.processBuffer();
            callback();
        } catch (err) {
            callback(err);
        }
    }

    processBuffer() {
        // To be implemented by subclasses
        // Should consume this.buffer and push complete packets
    }
}

module.exports = BaseFramer;
