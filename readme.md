[![npm version](https://img.shields.io/npm/v/rtmp-client.svg?logo=npm)](https://www.npmjs.com/package/rtmp-client)

# About

RTMP client.

# Usage

Install using npm:

```
$ npm install rtmp-client
```

## NetConnection

```
const { NetConnection } = require('rtmp-client');

const nc = new NetConnection();
nc.onStatus = function (info) {
	if (info.code === 'NetConnection.Connect.Success') {
		nc.call('foo', {
			'onResult': console.log.bind(console),
			'onStatus': console.error.bind(console),
		}, 'bar');
	}
};
nc.rpcName = async function (...args) {
	console.log('server called rpcName', ...args);
};
nc.connect('rtmp://127.0.0.1:1935/app/instance');
```

Documentation: [netconnection-class.html](https://helpx.adobe.com/adobe-media-server/ssaslr/netconnection-class.html)

## SharedObject

Since there was nothing in the RTMP spec about the messages, I've documented them in [SharedObject.md](https://github.com/csimi/rtmp-client/blob/master/SharedObject.md)

```
const so = SharedObject.get('foo', false, nc);
so.onStatus = (info) => {
	console.log(info);
};
so.onSync = (list) => {
	console.log('shared object changes', list);
};
```

Documentation: [sharedobject-class.html](https://helpx.adobe.com/adobe-media-server/ssaslr/sharedobject-class.html)

# Implementation status

- [x] NetConnection
- [x] SharedObject
	- [x] basic functionality
	- [ ] lock()/mark()/unlock() (non-proxied)
	- [ ] send()/handlerName()
- [ ] Stream
- [ ] NetStream
