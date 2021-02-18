const { Duplex } = require('stream');
const {
	Memo,
	toAMF,
	decodeAMF,
} = require('amf-codec');
const {
	SET_CHUNK_SIZE,
	COMMAND_MESSAGE_AMF0,
} = require('./MessageTypes');

const consumeAMF = (buf) => {
	const memo = new Memo();
	const data = [];
	
	while (memo.position < buf.length) {
		data.push(decodeAMF(buf, memo));
	}
	
	return data;
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
	
	_write ({ messageTypeId, messageBody }, encoding, callback) {
		switch (messageTypeId) {
			case SET_CHUNK_SIZE:
				this.emit('control', SET_CHUNK_SIZE, messageBody.readUInt32BE());
				break;
			case COMMAND_MESSAGE_AMF0: {
				const [name, transactionId, command, ...args] = consumeAMF(messageBody);
				if (!this.transactions.has(transactionId)) {
					this.emit('command', name, transactionId, command, ...args);
					return;
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
			default:
				break;
		}
		
		callback();
	}
	
	_read () {}
}

module.exports = MessageStream;
