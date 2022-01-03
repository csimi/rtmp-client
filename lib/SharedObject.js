const { serialize, deserialize } = require('v8');
const { EventEmitter } = require('events');
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
	CHANGE,
	STATUS,
	CLEAR,
	REMOVE,
	USE_SUCCESS,
	CHANGE_ECHO,
} = require('./SharedObjectTypes');

const {
	SO_PROXY_CONNECT,
} = InfoObject;

const instances = new Map();
const onSharedObjectMessage = Symbol('onSharedObjectMessage');

class SharedObject {
	static get (name, persistence, netConnection = null) {
		if (!instances.has(name)) {
			instances.set(name, new SharedObject(name, netConnection));
		}
		
		return instances.get(name);
	}
	
	static commit () {
		// noop
		return true;
	}
	
	constructor (name, netConnection = null) {
		this.name = name;
		this.autoCommit = true;
		this.isDirty = false;
		this.resyncDepth = Infinity;
		this.version = 0;
		this[SHAREDOBJECT] = new Map();
		this[EMITTER] = new EventEmitter();
		if (netConnection) {
			this[CLIENT] = netConnection;
			this[onSharedObjectMessage] = this[onSharedObjectMessage].bind(this);
			netConnection[EMITTER].on(SHAREDOBJECT, this[onSharedObjectMessage]);
			netConnection[USE_SO](name);
		}
	}
	
	clear () {
		const client = this[CLIENT];
		if (client) {
			client[CLEAR_SO](this.name, this.version);
		}
		else {
			this[SHAREDOBJECT].clear();
			this[EMITTER].emit(SHAREDOBJECT, [{
				'eventType': CLEAR,
				'eventData': [],
			}], this.version);
		}
	}
	
	close () {
		const client = this[CLIENT];
		if (client) {
			client[RELEASE_SO](this.name);
			client[EMITTER].off(SHAREDOBJECT, this[onSharedObjectMessage]);
		}
		instances.delete(this.name);
	}
	
	flush () {
		// not implemented
		return false;
	}
	
	getProperty (key) {
		const value = this[SHAREDOBJECT].get(key);
		return deserialize(serialize(value));
	}
	
	getPropertyNames () {
		return [...this[SHAREDOBJECT].keys()];
	}
	
	lock () {
		// not implemented
		return -1;
	}
	
	mark () {
		// not implemented
		return false;
	}
	
	onStatus () {
		// override
	}
	
	onSync () {
		// override
	}
	
	purge () {
		// noop
		return true;
	}
	
	send () {
		// not implemented
		return false;
	}
	
	setProperty (key, value) {
		const client = this[CLIENT];
		if (client) {
			client[SET_SO](this.name, key, value, this.version);
		}
		else {
			this[SHAREDOBJECT].set(key, value);
			this[EMITTER].emit(SHAREDOBJECT, [{
				'eventType': value === null ? REMOVE : CHANGE,
				'eventData': [key, value],
			}], this.version);
		}
	}
	
	size () {
		return this[SHAREDOBJECT].size;
	}
	
	unlock () {
		// not implemented
		return -1;
	}
	
	[onSharedObjectMessage] (name, version, events) {
		if (name !== this.name) {
			return;
		}
		if (version) {
			this.version = version;
		}
		
		const changeList = [];
		for (const { eventType, eventData } of events) {
			switch (eventType) {
				case STATUS: {
					const [code, level] = eventData;
					this.onStatus({
						level,
						code,
						'description': '',
					});
					break;
				}
				case USE_SUCCESS:
					this.onStatus({
						'level': InfoObject[SO_PROXY_CONNECT],
						'code': SO_PROXY_CONNECT,
						'description': '',
					});
					break;
				case CLEAR: {
					changeList.push({
						'code': 'clear',
					});
					this[SHAREDOBJECT].clear();
					break;
				}
				case CHANGE_ECHO:
				case CHANGE: {
					const [key, newValue] = eventData;
					changeList.push({
						'code': eventType === CHANGE ? 'change' : 'success',
						'name': key,
						newValue,
						'oldValue': this[SHAREDOBJECT].get(key),
					});
					this[SHAREDOBJECT].set(key, newValue);
					break;
				}
				case REMOVE: {
					const [key] = eventData;
					changeList.push({
						'code': 'delete',
						'name': key,
						'newValue': null,
						'oldValue': this[SHAREDOBJECT].get(key),
					});
					this[SHAREDOBJECT].delete(key);
					break;
				}
				default:
					break;
			}
		}
		
		this[EMITTER].emit(SHAREDOBJECT, events, this.version);
		if (changeList.length) {
			this.onSync(changeList);
		}
	}
}

module.exports = SharedObject;
