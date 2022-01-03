const { URL } = require('url');
const { EventEmitter } = require('events');
const Client = require('./Client');
const InfoObject = require('./InfoObject');
const {
	CLIENT,
	EMITTER,
	SHAREDOBJECT,
	USE_SO,
	RELEASE_SO,
	CLEAR_SO,
	SET_SO,
} = require('./Symbols');

const {
	NC_CALL_FAILED,
	NC_CONNECT_CLOSED,
	NC_CONNECT_FAILED,
} = InfoObject;

const onClosed = Symbol('onClosed');
const onConnected = Symbol('onConnected');
const onCommand = Symbol('onCommand');

const hasOwn = Object.prototype.hasOwnProperty;

class NetConnection {
	constructor () {
		this.farID = '';
		this.farNonce = '';
		this.isConnected = false;
		this.nearID = '';
		this.nearNonce = '';
		this.objectEncoding = 0;
		this.uri = null;
		this[CLIENT] = null;
		this[EMITTER] = new EventEmitter();
		this[SHAREDOBJECT] = [];
	}
	
	connect (uri, ...args) {
		if (this[CLIENT]) {
			this[CLIENT].close();
		}
		
		const params = new URL(uri);
		if (!params.port) {
			params.port = 1935;
		}
		
		const { protocol, hostname, port, pathname, search } = params;
		if (protocol !== 'rtmp:') {
			return false;
		}
		
		const [, application, instance] = pathname.split('/');
		if (!application) {
			return false;
		}
		
		const app = `${application}${instance ? '/' : ''}${instance || ''}`;
		const tcUrl = `${protocol}//${hostname}:${port}/${app}${search}`;
		
		const client = new Client(hostname, port);
		this[CLIENT] = client;
		
		client.on('command', this[onCommand].bind(this, client));
		client.on('sharedObject', this[EMITTER].emit.bind(this[EMITTER], SHAREDOBJECT));
		client.once('connect', this[onConnected].bind(this, client, uri, app, tcUrl, args));
		client.once('close', this[onClosed].bind(this));
		client.connect();
		
		return true;
	}
	
	close () {
		const client = this[CLIENT];
		if (!client) {
			return;
		}
		
		client.close();
	}
	
	async call (rpcName, responder, ...args) {
		if (!this.isConnected) {
			return false;
		}
		const client = this[CLIENT];
		if (!client) {
			return false;
		}
		
		try {
			const transactionId = responder ? null : 0;
			const [, response] = await client.invoke(rpcName, transactionId, null, ...args);
			if (!responder) {
				return;
			}
			
			responder.onResult(response);
		}
		catch (err) {
			if (!responder) {
				return;
			}
			
			if (err instanceof Error) {
				responder.onStatus({
					'level': InfoObject[NC_CALL_FAILED],
					'code': NC_CALL_FAILED,
					'description': err.message,
				});
			}
			else {
				const [, response] = err;
				responder.onStatus(response);
			}
		}
		
		return true;
	}
	
	addHeader () {
		// noop
	}
	
	onStatus () {
		// override
	}
	
	[onClosed] (err) {
		const code = this.isConnected ? NC_CONNECT_CLOSED : NC_CONNECT_FAILED;
		this.isConnected = false;
		this.uri = null;
		
		this.onStatus({
			'level': InfoObject[code],
			code,
			'description': err ? err.message : '',
		});
	}
	
	async [onConnected] (client, uri, app, tcUrl, args) {
		let infoObj;
		
		try {
			const [, response] = await client.invoke('connect', null, {
				app,
				tcUrl,
				'flashVer': 'WIN 32,0,0,465',
				'fpad': false,
				'capabilities': 15,
				'audioCodecs': 3191,
				'videoCodecs': 252,
				'videoFunction': 1,
				'objectEncoding': 0,
			}, ...args);
			
			this.isConnected = true;
			this.uri = uri;
			for (const name of [...new Set(this[SHAREDOBJECT])]) {
				client.useSharedObject(name);
			}
			
			infoObj = response;
		}
		catch (err) {
			if (err instanceof Error) {
				infoObj = {
					'level': InfoObject[NC_CONNECT_FAILED],
					'code': NC_CONNECT_FAILED,
					'description': err.message,
				};
			}
			else {
				const [, response] = err;
				infoObj = response;
			}
		}
		
		this.onStatus(infoObj);
	}
	
	async [onCommand] (client, name, transactionId, command, ...args) {
		if (typeof this[name] !== 'function' || !hasOwn.call(this.constructor, name)) {
			if (!transactionId) {
				return;
			}
			
			client.command('_error', transactionId, null, {
				'level': InfoObject[NC_CALL_FAILED],
				'code': NC_CALL_FAILED,
				'description': `Method not found (${name}).`,
			});
			return;
		}
		
		try {
			const response = await this[name](...args);
			if (!transactionId) {
				return;
			}
			
			client.command('_result', transactionId, null, response);
		}
		catch (err) {
			if (!transactionId) {
				return;
			}
			
			client.command('_error', transactionId, null, {
				'level': InfoObject[NC_CALL_FAILED],
				'code': NC_CALL_FAILED,
				'description': `Failed to execute method (${name}).`,
			});
		}
	}
	
	[USE_SO] (name) {
		const index = this[SHAREDOBJECT].indexOf(name);
		this[SHAREDOBJECT].push(name);
		if (!this.isConnected) {
			return;
		}
		if (index === -1) {
			const client = this[CLIENT];
			if (!client) {
				return;
			}
			client.useSharedObject(name);
		}
	}
	
	[RELEASE_SO] (name) {
		const index = this[SHAREDOBJECT].indexOf(name);
		if (index !== -1) {
			this[SHAREDOBJECT].splice(index, 1);
		}
		if (!this.isConnected) {
			return;
		}
		if (this[SHAREDOBJECT].indexOf(name) !== -1) {
			const client = this[CLIENT];
			if (!client) {
				return;
			}
			client.releaseSharedObject(name);
		}
	}
	
	[CLEAR_SO] (name, version) {
		if (!this.isConnected) {
			return;
		}
		const client = this[CLIENT];
		if (!client) {
			return;
		}
		client.clearSharedObject(name, version);
	}
	
	[SET_SO] (name, key, value, version) {
		if (!this.isConnected) {
			return;
		}
		const client = this[CLIENT];
		if (!client) {
			return;
		}
		client.setSharedObjectProperty(name, key, value, version);
	}
}

module.exports = NetConnection;
