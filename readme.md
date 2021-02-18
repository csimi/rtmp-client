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
		nc.call(foo, {
			'onResult': console.log.bind(console),
			'onStatus': console.error.bind(console),
		}, 'bar');
	}
};
nc.rpcName = function (...args) {
	console.log('server called rpcName', ...args);
};
nc.connect('rtmp://127.0.0.1:1935');
```

Documentation: [netconnection-class.html](https://helpx.adobe.com/adobe-media-server/ssaslr/netconnection-class.html)

# Implementation status

- [x] NetConnection
- [ ] SharedObject
- [ ] Stream
- [ ] NetStream
