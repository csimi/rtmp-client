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
	APPLY_SO,
} = require('./Symbols');
const {
	REQUEST_CHANGE,
	CHANGE,
	STATUS,
	CLEAR,
	REMOVE,
	REQUEST_REMOVE,
	USE_SUCCESS,
	CHANGE_ECHO,
	REQUEST_CLEAR,
} = require('./SharedObjectTypes');

const {
	SO_PROXY_CONNECT,
} = InfoObject;

const instances = new Map();
const onSharedObjectMessage = Symbol('onSharedObjectMessage');
const lockState = Symbol('lockState');

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
		if (!this[SHAREDOBJECT]) {
			return false;
		}
		
		const client = this[CLIENT];
		if (client) {
			client[CLEAR_SO](this.name, this.version);
			return true;
		}
		
		this[SHAREDOBJECT].clear();
		this[EMITTER].emit(SHAREDOBJECT, [{
			'eventType': CLEAR,
			'eventData': [],
		}], ++this.version);
		
		return true;
	}
	
	close () {
		if (!this[SHAREDOBJECT]) {
			return false;
		}
		
		const client = this[CLIENT];
		if (client) {
			client[RELEASE_SO](this.name);
			client[EMITTER].off(SHAREDOBJECT, this[onSharedObjectMessage]);
			this[client] = null;
		}
		
		instances.delete(this.name);
		this[SHAREDOBJECT].clear();
		this[SHAREDOBJECT] = null;
		
		return false;
	}
	
	flush () {
		// not implemented
		return false;
	}
	
	getProperty (key) {
		if (!this[SHAREDOBJECT]) {
			return null;
		}
		
		if (typeof key !== 'string' && typeof key !== 'number') {
			return null;
		}
		
		key = String(key);
		const value = this[lockState] && this[lockState].changes.has(key)
			? this[lockState].changes.get(key)
			: this[SHAREDOBJECT].get(key);
		
		if (typeof value === 'undefined') {
			return null;
		}
		
		return deserialize(serialize(value));
	}
	
	getPropertyNames () {
		if (!this[SHAREDOBJECT]) {
			return null;
		}
		
		const keys = this[SHAREDOBJECT].keys();
		if (this[lockState]) {
			return [...new Set([...keys, ...this[lockState].changes.keys()])];
		}
		
		return [...keys];
	}
	
	lock () {
		if (this[CLIENT]) {
			return -1;
		}
		
		if (!this[lockState]) {
			this[lockState] = {
				'count': 0,
				'changes': new Map(),
			};
		}
		
		return ++this[lockState].count;
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
	
	setProperty (key, value = null) {
		if (!this[SHAREDOBJECT]) {
			return false;
		}
		
		if (typeof key !== 'string' && typeof key !== 'number') {
			return false;
		}
		
		key = String(key);
		const client = this[CLIENT];
		if (client) {
			client[SET_SO](this.name, key, value, this.version);
			return true;
		}
		
		const isDelete = value === null || typeof value === 'undefined';
		if (this[lockState]) {
			if (this[SHAREDOBJECT].get(key) === value || (isDelete && !this[SHAREDOBJECT].has(key))) {
				this[lockState].changes.delete(key);
			}
			else {
				this[lockState].changes.set(key, value);
			}
			
			return true;
		}
		
		if (this[SHAREDOBJECT].get(key) === value) {
			return true;
		}
		
		if (isDelete) {
			this[SHAREDOBJECT].delete(key);
		}
		else {
			this[SHAREDOBJECT].set(key, value);
		}
		
		this[EMITTER].emit(SHAREDOBJECT, [{
			'eventType': isDelete ? REMOVE : CHANGE,
			'eventData': [key, value],
		}], ++this.version);
		
		return true;
	}
	
	size () {
		if (!this[SHAREDOBJECT]) {
			return 0;
		}
		
		if (this[lockState]) {
			return this.getPropertyNames().length;
		}
		
		return this[SHAREDOBJECT].size;
	}
	
	unlock () {
		if (this[CLIENT]) {
			return -1;
		}
		
		if (!this[lockState]) {
			return -1;
		}
		
		const count = --this[lockState].count;
		if (count > 0) {
			return count;
		}
		
		const changes = this[lockState].changes;
		delete this[lockState];
		
		if (changes.size) {
			this[EMITTER].emit(SHAREDOBJECT, [...changes.entries()].map(([key, value]) => {
				const isDelete = value === null || typeof value === 'undefined';
				if (isDelete) {
					this[SHAREDOBJECT].delete(key);
				}
				else {
					this[SHAREDOBJECT].set(key, value);
				}
				
				return {
					'eventType': isDelete ? REMOVE : CHANGE,
					'eventData': [key, value],
				};
			}), ++this.version);
		}
		
		return count;
	}
	
	[onSharedObjectMessage] (name, version, events) {
		if (name !== this.name) {
			return;
		}
		if (version) {
			this.version = version;
		}
		
		const changeEvents = [];
		const changeList = [];
		for (const event of events) {
			const { eventType, eventData } = event;
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
					changeEvents.push(event);
					changeList.push({
						'code': 'clear',
					});
					this[SHAREDOBJECT].clear();
					break;
				}
				case CHANGE_ECHO:
				case CHANGE: {
					// TODO: how to decide which client originated the change in client->server->proxy mode
					const [key, newValue] = eventData;
					changeEvents.push({
						...event,
						'eventType': CHANGE,
					});
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
					changeEvents.push(event);
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
		
		if (changeEvents.length) {
			this[EMITTER].emit(SHAREDOBJECT, changeEvents, this.version, null);
		}
		if (changeList.length) {
			this.onSync(changeList);
		}
	}
	
	[APPLY_SO] (events, uid) {
		const client = this[CLIENT];
		if (client) {
			client[APPLY_SO](this.name, events, this.version);
			return [];
		}
		
		const response = [];
		if (!this[SHAREDOBJECT]) {
			return response;
		}
		
		this.version++;
		const changeEvents = [];
		const changeList = [];
		
		for (const { eventType, eventData } of events) {
			const [key, newValue] = eventData;
			switch (eventType) {
				case REQUEST_CHANGE:
					changeEvents.push({
						'eventType': CHANGE,
						eventData,
					});
					changeList.push({
						'code': 'change',
						'name': key,
						newValue,
						'oldValue': this[SHAREDOBJECT].get(key),
					});
					response.push({
						'eventType': CHANGE_ECHO,
						eventData,
					});
					this[SHAREDOBJECT].set(key, newValue);
					break;
				case REQUEST_REMOVE:
					changeEvents.push({
						'eventType': REMOVE,
						eventData,
					});
					changeList.push({
						'code': 'delete',
						'name': key,
						'newValue': null,
						'oldValue': this[SHAREDOBJECT].get(key),
					});
					response.push({
						'eventType': REMOVE,
						eventData,
					});
					this[SHAREDOBJECT].delete(key);
					break;
				case REQUEST_CLEAR:
					changeEvents.push({
						'eventType': CLEAR,
						eventData,
					});
					changeList.push({
						'code': 'clear',
					});
					response.push({
						'eventType': CLEAR,
						eventData,
					});
					this[SHAREDOBJECT].clear();
					break;
				default:
					break;
			}
		}
		
		if (changeEvents.length) {
			this[EMITTER].emit(SHAREDOBJECT, changeEvents, this.version, uid);
		}
		if (changeList.length) {
			this.onSync(changeList);
		}
		
		return response;
	}
}

module.exports = SharedObject;
