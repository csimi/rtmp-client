const ERROR = 'error';
const STATUS = 'status';

const NC_CALL_FAILED = 'NetConnection.Call.Failed';
const NC_CONNECT_APPSHUTDOWN = 'NetConnection.Connect.AppShutdown';
const NC_CONNECT_CLOSED = 'NetConnection.Connect.Closed';
const NC_CONNECT_FAILED = 'NetConnection.Connect.Failed';
const NC_CONNECT_REJECTED = 'NetConnection.Connect.Rejected';
const NC_CONNECT_SUCCESS = 'NetConnection.Connect.Success';
const NC_PROXY_NOTRESPONDING = 'NetConnection.Proxy.NotResponding';
const SO_PROXY_CONNECT = 'SharedObject.Proxy.Connect';

module.exports = {
	NC_CALL_FAILED,
	NC_CONNECT_APPSHUTDOWN,
	NC_CONNECT_FAILED,
	NC_CONNECT_CLOSED,
	NC_CONNECT_REJECTED,
	NC_CONNECT_SUCCESS,
	NC_PROXY_NOTRESPONDING,
	SO_PROXY_CONNECT,
	[NC_CALL_FAILED]: ERROR,
	[NC_CONNECT_APPSHUTDOWN]: ERROR,
	[NC_CONNECT_CLOSED]: STATUS,
	[NC_CONNECT_FAILED]: ERROR,
	[NC_CONNECT_REJECTED]: ERROR,
	[NC_CONNECT_SUCCESS]: STATUS,
	[NC_PROXY_NOTRESPONDING]: ERROR,
	[SO_PROXY_CONNECT]: STATUS,
};
