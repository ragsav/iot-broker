const Tft100Decoder = require('./tft100/decoder');
const Tft100Encoder = require('./tft100/encoder');
const Tft100Framer = require('./tft100/framer');

/**
 * Protocol definitions.
 * Decoder and Encoder are shared singletons (stateless).
 * Framer is a class — a new instance is created per socket (it holds buffer state).
 */
const protocols = {
    tft100: {
        Framer: Tft100Framer,
        decoder: new Tft100Decoder(),
        encoder: new Tft100Encoder(),
    }
};

/**
 * Creates a protocol adapter for a socket.
 * @param {string} protocolName 
 * @returns {{ framer: BaseFramer, decoder: BaseDecoder, encoder: BaseEncoder }}
 */
function createProtocolAdapter(protocolName) {
    const protocol = protocols[protocolName];
    if (!protocol) {
        throw new Error(`[PROTOCOL] Unknown protocol: ${protocolName}`);
    }

    return {
        name: protocolName,
        framer: new protocol.Framer(),  // per-socket (has buffer state)
        decoder: protocol.decoder,       // shared singleton (stateless)
        encoder: protocol.encoder,       // shared singleton (stateless)
    };
}

module.exports = { createProtocolAdapter };
