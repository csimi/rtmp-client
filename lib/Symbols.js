const CLIENT = Symbol('client');
const EMITTER = Symbol('emitter');
const SHAREDOBJECT = Symbol('sharedobject');
const USE_SO = Symbol('use');
const RELEASE_SO = Symbol('release');
const CLEAR_SO = Symbol('clear');
const SET_SO = Symbol('set');
const APPLY_SO = Symbol('apply');
const PING_PONG = Symbol('pingpong');
const PING_FREQUENCY = Symbol('frequency');
const PING_TIMEOUT = Symbol('timeout');

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
