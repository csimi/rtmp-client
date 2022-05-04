/* eslint-disable no-bitwise */

const { Transform } = require('stream');
const { Memo } = require('amf-codec');
const {
	TYPE_1,
	TYPE_2,
	TYPE_3,
	ID_LIMIT_ONE,
	ID_MASK_ONE,
	ID_MASK_TWO,
	CHUNK_SIZE,
	TIMESTAMP_MAX,
} = require('./ChunkConstants');
const {
	SET_CHUNK_SIZE,
	ABORT_MESSAGE,
	ACKNOWLEDGEMENT,
	WINDOW_ACKNOWLEDGEMENT_SIZE,
} = require('../MessageTypes');

const decodeBasicHeader = (buf, memo) => {
	const octet = buf.readUInt8(memo.consume(1));
	const format = octet & ~ID_MASK_ONE;
	
	if (octet & ID_MASK_ONE === 0) {
		if (buf.length < memo.position + 1) {
			return [null, null];
		}
		const chunkStreamId = buf.readUInt8(memo.consume(1)) + ID_LIMIT_ONE;
		return [format, chunkStreamId];
	}
	else if (octet & ID_MASK_TWO === 0) {
		if (buf.length < memo.position + 2) {
			return [null, null];
		}
		const chunkStreamId = buf.readUInt16BE(memo.consume(2)) + ID_LIMIT_ONE;
		return [format, chunkStreamId];
	}
	else {
		const chunkStreamId = octet & ID_MASK_ONE;
		return [format, chunkStreamId];
	}
};

const decodeMessageHeader = (buf, memo, format) => {
	const header = {};
	if (format === TYPE_3) {
		return header;
	}
	
	if (buf.length < memo.position + 3) {
		return null;
	}
	header.timestamp = buf.readUIntBE(memo.consume(3), 3);
	if (format === TYPE_2) {
		return header;
	}
	
	if (buf.length < memo.position + 4) {
		return null;
	}
	header.messageBodyLength = buf.readUIntBE(memo.consume(3), 3);
	header.messageTypeId = buf.readUIntBE(memo.consume(1), 1);
	if (format === TYPE_1) {
		return header;
	}
	
	if (buf.length < memo.position + 4) {
		return null;
	}
	header.messageStreamId = buf.readUIntLE(memo.consume(4), 4);
	
	return header;
};

class ChunkStreamDemuxer extends Transform {
	constructor () {
		super({
			'readableObjectMode': true,
		});
		
		this.chunkSize = CHUNK_SIZE;
		this.windowSize = 0;
		this.bytesReceived = 0;
		this.buffer = Buffer.allocUnsafe(0);
		this.buffers = new Map();
		this.cache = new Map();
	}
	
	onControl (messageTypeId, value) {
		switch (messageTypeId) {
			case SET_CHUNK_SIZE:
				this.chunkSize = value;
				break;
			case ABORT_MESSAGE:
				this.buffers.delete(value);
				break;
			case WINDOW_ACKNOWLEDGEMENT_SIZE:
				this.windowSize = value;
				if (this.windowSize && this.windowSize <= this.bytesReceived) {
					this.sendAcknowledgement();
				}
				break;
			default:
				break;
		}
	}
	
	sendAcknowledgement () {
		if (this.windowSize > this.bytesReceived) {
			return;
		}
		
		this.bytesReceived -= this.windowSize;
		
		const buf = Buffer.allocUnsafe(4);
		buf.writeUInt32BE(this.windowSize);
		
		this.emit('control', ACKNOWLEDGEMENT, buf);
	}
	
	_transform (data, encoding, callback, isRecursive) {
		try {
			if (!isRecursive) {
				this.bytesReceived += data.length;
				if (this.windowSize && this.windowSize <= this.bytesReceived) {
					this.sendAcknowledgement();
				}
			}
			if (this.buffer.length) {
				data = Buffer.concat([
					this.buffer,
					data,
				]);
				this.buffer = Buffer.allocUnsafe(0);
			}
			
			const memo = new Memo(0);
			const [format, chunkStreamId] = decodeBasicHeader(data, memo);
			if (format === null) {
				this.buffer = data;
				return callback();
			}
			
			const messageHeader = decodeMessageHeader(data, memo, format);
			if (!messageHeader) {
				this.buffer = data;
				return callback();
			}
			
			const cachedHeader = {
				...this.cache.get(chunkStreamId),
				...messageHeader,
			};
			this.cache.set(chunkStreamId, cachedHeader);
			if (cachedHeader.timestamp >= TIMESTAMP_MAX) {
				cachedHeader.timestamp = data.readUInt32BE(memo.consume(4));
			}
			
			const remainingLength = data.length - memo.position;
			const chunkBuffer = this.buffers.get(chunkStreamId) || Buffer.allocUnsafe(0);
			if (remainingLength + chunkBuffer.length < cachedHeader.messageBodyLength && remainingLength < this.chunkSize) {
				this.buffer = data;
				return callback();
			}
			
			const dataSize = Math.min(
				this.chunkSize,
				remainingLength,
				cachedHeader.messageBodyLength - chunkBuffer.length,
			);
			const chunkData = Buffer.concat([
				chunkBuffer,
				data.slice(memo.position, memo.skip(dataSize)),
			]);
			
			if (chunkData.length < cachedHeader.messageBodyLength) {
				this.buffers.set(chunkStreamId, chunkData);
			}
			else {
				this.buffers.set(chunkStreamId, Buffer.allocUnsafe(0));
				this.push({
					chunkStreamId,
					...cachedHeader,
					'messageBody': chunkData,
				});
			}
			
			if (data.length > memo.position) {
				/* eslint-disable-next-line no-underscore-dangle */
				return this._transform(data.slice(memo.position), encoding, callback, true);
			}
			
			return callback();
		}
		catch (err) {
			return callback(err);
		}
	}
}

module.exports = ChunkStreamDemuxer;
