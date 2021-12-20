/* eslint-disable no-bitwise */

const { Transform } = require('stream');
const {
	TYPE_0,
	TYPE_1,
	TYPE_2,
	TYPE_3,
	ID_LIMIT_ONE,
	ID_LIMIT_TWO,
	CHUNK_SIZE,
	TIMESTAMP_MAX,
} = require('./ChunkConstants');

const createTimestamp = () => {
	let memo = Date.now();
	return () => {
		const now = Date.now();
		const timestamp = now - memo;
		
		if (timestamp < TIMESTAMP_MAX) {
			return timestamp;
		}
		else {
			const next = timestamp - TIMESTAMP_MAX;
			memo = now - next; // timestamp is in the future
			return next;
		}
	};
};

const encodeBasicHeader = (format, chunkStreamId) => {
	if (chunkStreamId < ID_LIMIT_ONE) {
		return Buffer.from([chunkStreamId | format]);
	}
	else if (chunkStreamId < ID_LIMIT_TWO) {
		return Buffer.from([format, chunkStreamId - ID_LIMIT_ONE]);
	}
	else {
		const buf = Buffer.allocUnsafe(3);
		
		buf.writeUInt8(format | 1, 0);
		buf.writeUInt16BE(chunkStreamId - ID_LIMIT_ONE, 1);
		
		return buf;
	}
};

const getMessageHeaderSize = (format) => {
	switch (format) {
		case TYPE_0:
			return 11;
		case TYPE_1:
			return 7;
		case TYPE_2:
			return 3;
		default:
			return 0;
	}
};

const encodeMessageHeader = (format, timestamp, messageBodyLength, messageTypeId, messageStreamId) => {
	const buf = Buffer.allocUnsafe(getMessageHeaderSize(format));
	if (format === TYPE_3) {
		return buf;
	}
	
	buf.writeUIntBE(timestamp, 0, 3);
	if (format === TYPE_2) {
		return buf;
	}
	
	buf.writeUIntBE(messageBodyLength, 3, 3);
	buf.writeUIntBE(messageTypeId, 6, 1);
	if (format === TYPE_1) {
		return buf;
	}
	
	buf.writeUIntLE(messageStreamId, 7, 4);
	
	return buf;
};

class ChunkStreamEncoder extends Transform {
	constructor (chunkStreamId = 2) {
		super({
			'writableObjectMode': true,
		});
		
		this.chunkStreamId = chunkStreamId;
		this.timestamp = createTimestamp();
	}
	
	_transform ({ messageTypeId, messageStreamId, messageBody }, encoding, callback) {
		let format = TYPE_0;
		const timestamp = this.timestamp();
		for (let position = 0; position < messageBody.length; position += CHUNK_SIZE) {
			const basicHeader = encodeBasicHeader(
				format,
				this.chunkStreamId,
			);
			const messageHeader = encodeMessageHeader(
				format,
				timestamp,
				messageBody.length,
				messageTypeId,
				messageStreamId,
			);
			
			format = TYPE_3;
			const chunk = messageBody.slice(
				position,
				Math.min(messageBody.length, position + CHUNK_SIZE),
			);
			
			this.push(Buffer.concat([
				basicHeader,
				messageHeader,
				chunk,
			]));
		}
		
		callback();
	}
}

module.exports = ChunkStreamEncoder;
