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
} = require('./ChunkConstants');
const {
	SET_CHUNK_SIZE,
} = require('../MessageTypes');

const decodeBasicHeader = (buf, memo) => {
	const byte = buf.readUInt8(memo.consume(1));
	const format = byte & ~ID_MASK_ONE;
	
	if (byte & ID_MASK_ONE === 0) {
		const chunkStreamId = buf.readUInt8(memo.consume(1)) + ID_LIMIT_ONE;
		return [format, chunkStreamId];
	}
	else if (byte & ID_MASK_TWO === 0) {
		const chunkStreamId = buf.readUInt16BE(memo.consume(2)) + ID_LIMIT_ONE;
		return [format, chunkStreamId];
	}
	else {
		const chunkStreamId = byte & ID_MASK_ONE;
		return [format, chunkStreamId];
	}
};

const decodeMessageHeader = (buf, memo, format) => {
	const header = {};
	if (format === TYPE_3) {
		return header;
	}
	
	header.timestamp = buf.readUIntBE(memo.consume(3), 3);
	if (format === TYPE_2) {
		return header;
	}
	
	header.messageBodyLength = buf.readUIntBE(memo.consume(3), 3);
	header.messageTypeId = buf.readUIntBE(memo.consume(1), 1);
	if (format === TYPE_1) {
		return header;
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
		this.buffers = new Map();
		this.cache = new Map();
	}
	
	onControl (messageTypeId, data) {
		if (messageTypeId === SET_CHUNK_SIZE) {
			this.chunkSize = data;
		}
	}
	
	_transform (data, encoding, callback) {
		const memo = new Memo(0);
		const [format, chunkStreamId] = decodeBasicHeader(data, memo);
		
		const messageHeader = {
			...this.cache.get(chunkStreamId),
			...decodeMessageHeader(data, memo, format),
		};
		this.cache.set(chunkStreamId, messageHeader);
		
		const chunkBuffer = this.buffers.get(chunkStreamId) || Buffer.alloc(0);
		const dataSize = Math.min(
			this.chunkSize,
			data.length - memo.position,
			messageHeader.messageBodyLength - chunkBuffer.length,
		);
		const chunkData = Buffer.concat([
			chunkBuffer,
			data.slice(memo.position, memo.skip(dataSize)),
		]);
		
		if (chunkData.length < messageHeader.messageBodyLength) {
			this.buffers.set(chunkStreamId, chunkData);
		}
		else {
			this.buffers.set(chunkStreamId, Buffer.alloc(0));
			
			if (messageHeader.messageTypeId === 1) {
				this.chunkSize = chunkData.readUInt32BE();
			}
			
			this.push({
				chunkStreamId,
				...messageHeader,
				'messageBody': chunkData,
			});
		}
		
		if (data.length > memo.position) {
			/* eslint-disable-next-line no-underscore-dangle */
			return this._transform(data.slice(memo.position), encoding, callback);
		}
		
		return callback();
	}
}

module.exports = ChunkStreamDemuxer;
