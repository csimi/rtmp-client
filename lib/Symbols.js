const CLIENT = Symbol.for('client');
const EMITTER = Symbol.for('emitter');
const SHAREDOBJECT = Symbol.for('sharedobject');
const USE_SO = Symbol.for('use');
const RELEASE_SO = Symbol.for('release');
const CLEAR_SO = Symbol.for('clear');
const SET_SO = Symbol.for('set');
const APPLY_SO = Symbol.for('apply');
const PING_PONG = Symbol.for('pingpong');
const PING_FREQUENCY = Symbol.for('frequency');
const PING_TIMEOUT = Symbol.for('timeout');

module.exports = {
	CLIENT,
	EMITTER,
	SHAREDOBJECT,
	USE_SO,
	RELEASE_SO,
	CLEAR_SO,
	SET_SO,
	APPLY_SO,
	PING_PONG,
	PING_FREQUENCY,
	PING_TIMEOUT,
};
