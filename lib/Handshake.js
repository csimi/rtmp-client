const { Transform } = require('stream');
const { randomBytes } = require('crypto');

const HANDSHAKE_STATE_UNINITIALIZED = 0;
const HANDSHAKE_STATE_VERSION_SENT = 1;
const HANDSHAKE_STATE_ACK_SENT = 2;
const HANDSHAKE_STATE_DONE = 3;

const HANDSHAKE_LENGTH_VERSION = 1;
const HANDSHAKE_LENGTH_TIME = 4;
const HANDSHAKE_LENGTH_ECHO = 4;
const HANDSHAKE_LENGTH_RANDOM = 1528;

const HANDSHAKE_LENGTH_HEAD = HANDSHAKE_LENGTH_TIME + HANDSHAKE_LENGTH_ECHO;
const HANDSHAKE_LENGTH = HANDSHAKE_LENGTH_HEAD + HANDSHAKE_LENGTH_RANDOM;

const getUnixTime = () => Math.trunc(Date.now() / 1000);

const C0 = (version = 3) => {
	return Buffer.from([version]);
};

const S0 = C0;

const C1 = () => {
	const buf = Buffer.allocUnsafe(HANDSHAKE_LENGTH_HEAD);
	
	buf.writeUInt32BE(getUnixTime(), 0);
	buf.writeUInt32BE(0, HANDSHAKE_LENGTH_TIME);
	
	return Buffer.concat([
		buf,
		randomBytes(1528),
	]);
};

const S1 = C1;

const C2 = (prev) => {
	const time = prev.readUInt32BE(0);
	const random = prev.slice(HANDSHAKE_LENGTH_HEAD);
	
	const buf = Buffer.allocUnsafe(HANDSHAKE_LENGTH_HEAD);
	
	buf.writeUInt32BE(time, 0);
	buf.writeUInt32BE(getUnixTime(), HANDSHAKE_LENGTH_TIME);
	
	return Buffer.concat([
		buf,
		random,
	]);
};

const S2 = C2;

class Handshake extends Transform {
	constructor () {
		super();
		
		this.buffers = [];
		this.state = HANDSHAKE_STATE_UNINITIALIZED;
		this.c0 = C0();
		this.c1 = C1();
	}
	
	initialize (socket) {
		this.once('done', () => {
			this.unpipe(socket);
			socket.unpipe(this);
		});
		this.pipe(socket).pipe(this);
		
		socket.write(Buffer.concat([this.c0, this.c1]));
		this.state = HANDSHAKE_STATE_VERSION_SENT;
	}
	
	getBufferLength (chunkLength = 0) {
		return this.buffers.reduce((memo, buf) => memo + buf.length, chunkLength);
	}
	
	_transform (chunk, encoding, callback) {
		if (this.state === HANDSHAKE_STATE_DONE) {
			this.push(chunk);
			callback();
		}
		else if (this.state === HANDSHAKE_STATE_VERSION_SENT && this.getBufferLength(chunk.length) > HANDSHAKE_LENGTH) {
			const buf = Buffer.concat(this.buffers.concat(chunk));
			this.buffers = [buf.slice(HANDSHAKE_LENGTH + HANDSHAKE_LENGTH_VERSION)];
			
			const s0 = buf.slice(0, HANDSHAKE_LENGTH_VERSION);
			if (Buffer.compare(this.c0, s0)) {
				this.emit('error');
				return;
			}
			
			const s1 = buf.slice(HANDSHAKE_LENGTH_VERSION, HANDSHAKE_LENGTH + HANDSHAKE_LENGTH_VERSION);
			this.c2 = C2(s1);
			this.state = HANDSHAKE_STATE_ACK_SENT;
			
			this.push(this.c2);
			/* eslint-disable-next-line no-underscore-dangle */
			this._transform(Buffer.allocUnsafe(0), encoding, callback);
		}
		else if (this.state === HANDSHAKE_STATE_ACK_SENT && this.getBufferLength(chunk.length) >= HANDSHAKE_LENGTH) {
			const buf = Buffer.concat(this.buffers.concat(chunk));
			this.buffers = [];
			
			const s2 = buf.slice(HANDSHAKE_LENGTH_HEAD, HANDSHAKE_LENGTH);
			if (Buffer.compare(this.c1.slice(HANDSHAKE_LENGTH_HEAD), s2)) {
				this.emit('error');
				return;
			}
			
			this.state = HANDSHAKE_STATE_DONE;
			this.emit('done');
			
			callback();
		}
		else {
			this.buffers.push(chunk);
			callback();
		}
	}
}

module.exports = {
	Handshake,
	C0,
	S0,
	C1,
	S1,
	C2,
	S2,
};
