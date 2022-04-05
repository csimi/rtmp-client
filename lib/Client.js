const { EventEmitter } = require('events');
const { pipeline } = require('stream');
const { createConnection } = require('net');
const {
	toAMF,
} = require('amf-codec');
const {
	encodeStringValue,
} = require('amf-codec/lib/types/string');
const { Handshake } = require('./Handshake');
const MessageStream = require('./MessageStream');
const ChunkStreamEncoder = require('./ChunkStream/ChunkStreamEncoder');
const ChunkStreamDemuxer = require('./ChunkStream/ChunkStreamDemuxer');
const ChunkStreamFilter = require('./ChunkStream/ChunkStreamFilter');
const {
	USE,
	RELEASE,
	REQUEST_CLEAR,
	REQUEST_CHANGE,
	REQUEST_REMOVE,
} = require('./SharedObjectTypes');

const noop = () => {};
const promises = new WeakMap();

class Client extends EventEmitter {
	constructor (hostname, port = 1935) {
		super();
		
		this.hostname = hostname;
		this.port = port;
		
		this.handshake = new Handshake();
		this.chunkStreamId = 2;
		this.isDestroyed = false;
	}
	
	connect () {
		if (this.isDestroyed) {
			return Promise.reject(new Error('socket is destroyed'));
		}
		if (promises.has(this)) {
			return promises.get(this);
		}
		
		const promise = new Promise((resolve, reject) => {
			this.socket = createConnection(this.port, this.hostname, this.onConnect.bind(this, resolve));
			this.socket.once('close', this.onClose.bind(this, reject));
			this.socket.once('error', this.onClose.bind(this, reject));
		});
		
		promises.set(this, promise);
		
		return promise;
	}
	
	close () {
		if (this.socket && !this.socket.destroyed) {
			this.socket.end();
		}
	}
	
	onConnect (resolve) {
		this.handshake.initialize(this.socket);
		this.handshake.once('done', this.onHandshake.bind(this, resolve));
		this.handshake.once('error', () => this.socket.destroy());
	}
	
	onClose (reject, err) {
		if (this.isDestroyed) {
			return;
		}
		
		this.isDestroyed = true;
		this.emit('close', err);
		reject(err instanceof Error ? err : new Error('socket closed'));
	}
	
	onHandshake (resolve) {
		this.demuxer = pipeline(
			this.socket,
			new ChunkStreamDemuxer(),
			noop,
		);
		
		this.controlStream = this.createStream();
		this.controlStream.on('control', this.demuxer.onControl.bind(this.demuxer));
		this.controlStream.on('ping', this.emit.bind(this, 'ping'));
		this.controlStream.on('pong', this.emit.bind(this, 'pong'));
		this.demuxer.on('control', this.controlStream.send.bind(this.controlStream));
		this.commandStream = this.createStream();
		this.commandStream.on('command', this.onCommand.bind(this));
		this.commandStream.on('sharedObject', this.emit.bind(this, 'sharedObject'));
		
		this.emit('connect');
		resolve();
	}
	
	ping () {
		return this.controlStream.ping();
	}
	
	command (...args) {
		this.commandStream.command(...args);
	}
	
	invoke (...args) {
		return this.commandStream.invoke(...args);
	}
	
	onCommand (name, transactionId, command, ...args) {
		switch (name) {
			case 'close':
				this.close();
				break;
			case '_result':
			case '_error':
				break;
			default:
				this.emit('command', name, transactionId, command, ...args);
				break;
		}
	}
	
	useSharedObject (name) {
		this.commandStream.sendSharedObject(name, 0, 16, USE, Buffer.allocUnsafe(0));
	}
	
	releaseSharedObject (name) {
		this.commandStream.sendSharedObject(name, 0, 16, RELEASE, Buffer.allocUnsafe(0));
	}
	
	clearSharedObject (name, version = 0) {
		this.commandStream.sendSharedObject(name, version, 16, REQUEST_CLEAR, Buffer.allocUnsafe(0));
	}
	
	setSharedObjectProperty (name, key, value, version = 0) {
		const data = Buffer.concat([
			...encodeStringValue(key),
			value === null ? Buffer.allocUnsafe(0) : toAMF(value),
		]);
		const type = value === null ? REQUEST_REMOVE : REQUEST_CHANGE;
		this.commandStream.sendSharedObject(name, version, 16, type, data);
	}
	
	applySharedObjectEvents (name, events, version = 0) {
		this.commandStream.sendSharedObject(name, version, 16, ...events.flatMap(({ eventType, eventData }) => {
			const [key, value] = eventData;
			return [eventType, Buffer.concat([
				key ? Buffer.concat(encodeStringValue(key)) : Buffer.alloc(0),
				value ? toAMF(value) : Buffer.alloc(0),
			])];
		}));
	}
	
	createStream (messageStreamId = 0) {
		const chunkStreamId = this.chunkStreamId++;
		const stream = new MessageStream(messageStreamId);
		const encoder = new ChunkStreamEncoder(chunkStreamId);
		const filter = new ChunkStreamFilter(chunkStreamId);
		
		pipeline(
			stream,
			encoder,
			this.socket,
			noop,
		);
		
		pipeline(
			this.demuxer,
			filter,
			stream,
			noop,
		);
		
		return stream;
	}
}

module.exports = Client;
