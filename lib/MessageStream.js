const { Duplex } = require('stream');
const {
	Memo,
	toAMF,
	decodeAMF,
} = require('amf-codec');
const {
	decodeString,
	encodeStringValue,
} = require('amf-codec/lib/types/string');
const {
	SET_CHUNK_SIZE,
	ABORT_MESSAGE,
	ACKNOWLEDGEMENT,
	USER_CONTROL_MESSAGE,
	WINDOW_ACKNOWLEDGEMENT_SIZE,
	SET_PEER_BANDWIDTH,
	COMMAND_MESSAGE_AMF0,
	SHARED_OBJECT_MESSAGE_AMF0,
} = require('./MessageTypes');
const {
	PING_REQUEST,
	PING_RESPONSE,
} = require('./MessageEvents');
const {
	REQUEST_CHANGE,
	CHANGE,
	STATUS,
	REMOVE,
	REQUEST_REMOVE,
	CHANGE_ECHO,
} = require('./SharedObjectTypes');

const consumeAMF = (buf) => {
	const memo = new Memo();
	const data = [];
	
	while (memo.position < buf.length) {
		data.push(decodeAMF(buf, memo));
	}
	
	return data;
};

const consumeStrings = (buf) => {
	const memo = new Memo();
	const data = [];
	
	while (memo.position < buf.length) {
		data.push(decodeString(buf, memo));
	}
	
	return data;
};

const createU32 = (value) => {
	const buf = Buffer.allocUnsafe(4);
	buf.writeUInt32BE(value);
	return buf;
};

class MessageStream extends Duplex {
	constructor (messageStreamId = 0) {
		super({
			'objectMode': true,
		});
		
		this.messageStreamId = messageStreamId;
		this.transactions = new Map();
		this.transactionId = 1;
	}
	
	send (messageTypeId, messageBody) {
		this.push({
			'messageStreamId': this.messageStreamId,
			messageTypeId,
			messageBody,
		});
	}
	
	command (name, transactionId, command = null, ...args) {
		this.send(COMMAND_MESSAGE_AMF0, Buffer.concat([
			name,
			transactionId,
			command,
			...args,
		].map(toAMF)));
	}
	
	invoke (name, transactionId = null, command = null, ...args) {
		if (transactionId === null) {
			transactionId = this.transactionId++;
		}
		
		return new Promise((resolve, reject) => {
			if (transactionId) {
				this.transactions.set(transactionId, {
					resolve,
					reject,
				});
			}
			
			this.command(name, transactionId, command, ...args);
			if (!transactionId) {
				resolve([null]);
			}
		});
	}
	
	pong (timestamp) {
		const buf = Buffer.allocUnsafe(6);
		
		buf.writeUInt16BE(PING_RESPONSE);
		buf.writeUInt32BE(timestamp, 2);
		
		this.send(USER_CONTROL_MESSAGE, buf);
	}
	
	sendSharedObject (name, version, flags, type, data) {
		this.send(SHARED_OBJECT_MESSAGE_AMF0, Buffer.concat([
			...encodeStringValue(name),
			createU32(version),
			createU32(flags),
			createU32(0),
			Buffer.from([type]),
			createU32(data.length),
			data,
		]));
	}
	
	_write ({ messageTypeId, messageBody }, encoding, callback) {
		switch (messageTypeId) {
			case SET_CHUNK_SIZE:
			case ABORT_MESSAGE:
			case ACKNOWLEDGEMENT:
			case WINDOW_ACKNOWLEDGEMENT_SIZE:
				this.emit('control', messageTypeId, messageBody.readUInt32BE());
				break;
			case SET_PEER_BANDWIDTH:
				this.emit('control', messageTypeId, messageBody.readUInt32BE(), messageBody.readUInt8(4));
				break;
			case USER_CONTROL_MESSAGE: {
				const eventTypeId = messageBody.readUInt16BE();
				switch (eventTypeId) {
					case PING_REQUEST:
						this.pong(messageBody.readUInt32BE(2));
						break;
					default:
						break;
				}
				break;
			}
			case COMMAND_MESSAGE_AMF0: {
				const [name, transactionId, command, ...args] = consumeAMF(messageBody);
				if (!this.transactions.has(transactionId)) {
					this.emit('command', name, transactionId, command, ...args);
					break;
				}
				
				const promise = this.transactions.get(transactionId);
				this.transactions.delete(transactionId);
				const response = [
					command,
					...args,
				];
				
				if (name === '_result') {
					promise.resolve(response);
				}
				else if (name === '_error') {
					promise.reject(response);
				}
				
				break;
			}
			case SHARED_OBJECT_MESSAGE_AMF0: {
				const events = [];
				const memo = new Memo();
				const name = decodeString(messageBody, memo);
				const version = messageBody.readUInt32BE(memo.consume(12)); // consume flags
				
				while (memo.position < messageBody.length) {
					const eventType = messageBody.readUInt8(memo.consume(1));
					const eventLength = messageBody.readUInt32BE(memo.consume(4));
					
					let eventData = [];
					if (!eventLength) {
						events.push({
							eventType,
							eventData,
						});
						continue;
					}
					
					switch (eventType) {
						case STATUS:
							eventData = consumeStrings(messageBody.slice(memo.position, memo.skip(eventLength)));
							break;
						case REQUEST_CHANGE:
						case CHANGE:
						case CHANGE_ECHO:
							eventData = [decodeString(messageBody, memo), decodeAMF(messageBody, memo)];
							break;
						case REMOVE:
						case REQUEST_REMOVE:
							eventData = [decodeString(messageBody, memo)];
							break;
						default:
							memo.consume(eventLength);
							break;
					}
					
					events.push({
						eventType,
						eventData,
					});
				}
				
				this.emit('sharedObject', name, version, events);
				break;
			}
			default:
				break;
		}
		
		callback();
	}
	
	_read () {}
}

module.exports = MessageStream;
