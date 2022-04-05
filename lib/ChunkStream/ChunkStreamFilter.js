const { Transform } = require('stream');

class ChunkStreamFilter extends Transform {
	constructor (chunkStreamId) {
		super({
			'objectMode': true,
		});
		
		this.chunkStreamId = chunkStreamId;
	}
	
	_transform (chunk, encoding, callback) {
		if (chunk && chunk.chunkStreamId === this.chunkStreamId) {
			this.push(chunk);
		}
		callback();
	}
}

module.exports = ChunkStreamFilter;
