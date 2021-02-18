const Client = require('./Client');
const InfoObject = require('./InfoObject');

const clients = new WeakMap();
const {
	NC_CALL_FAILED,
	NC_CONNECT_CLOSED,
	NC_CONNECT_FAILED,
} = InfoObject;

function onClosed (err) {
	clients.delete(this);
	
	const code = this.isConnected ? NC_CONNECT_CLOSED : NC_CONNECT_FAILED;
	this.isConnected = false;
	this.uri = null;
	
	this.onStatus({
		'level': InfoObject[code],
		code,
		'description': err ? err.message : '',
	});
}

async function onConnected (client, uri, app, tcUrl, args) {
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
		this.onStatus(response);
	}
	catch (err) {
		if (err instanceof Error) {
			this.onStatus({
				'level': InfoObject[NC_CONNECT_FAILED],
				'code': NC_CONNECT_FAILED,
				'description': err.message,
			});
		}
		else {
			const [, response] = err;
			this.onStatus(response);
		}
	}
}

async function onCommand (name, transactionId, command, ...args) {
	const client = clients.get(this);
	if (typeof this[name] !== 'function' || Object.hasOwnProperty.call(this.constructor, name)) {
		if (!client || !transactionId) {
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
		if (!client || !transactionId) {
			return;
		}
		
		client.command('_result', transactionId, null, response);
	}
	catch (err) {
		if (!client || !transactionId) {
			return;
		}
		
		client.command('_error', transactionId, null, {
			'level': InfoObject[NC_CALL_FAILED],
			'code': NC_CALL_FAILED,
			'description': `Failed to execute method (${name}).`,
		});
	}
}

async function remoteCall (client, rpcName, responder, ...args) {
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
}

class NetConnection {
	constructor () {
		this.farID = '';
		this.farNonce = '';
		this.isConnected = false;
		this.nearID = '';
		this.nearNonce = '';
		this.objectEncoding = 0;
		this.uri = null;
	}
	
	connect (uri, ...args) {
		if (clients.has(this)) {
			clients.get(this).close();
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
		clients.set(this, client);
		
		client.on('command', onCommand.bind(this));
		client.once('connect', onConnected.bind(this, client, uri, app, tcUrl, args));
		client.once('close', onClosed.bind(this));
		client.connect();
		
		return true;
	}
	
	close () {
		const client = clients.get(this);
		if (!client) {
			return;
		}
		
		client.close();
	}
	
	call (rpcName, responder, ...args) {
		if (!this.isConnected) {
			return false;
		}
		const client = clients.get(this);
		if (!client) {
			return false;
		}
		
		remoteCall.call(this, client, rpcName, responder, ...args);
		
		return true;
	}
	
	addHeader () {
		// noop
	}
	
	onStatus () {
		// override
	}
}

module.exports = NetConnection;
