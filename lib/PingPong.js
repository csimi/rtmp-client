class PingPong {
	constructor (frequency, timeout) {
		this.frequency = frequency;
		this.timeout = timeout;
		
		this.client = null;
		this.timer = null;
		this.value = 0;
		
		this.ping = this.ping.bind(this);
		this.onPong = this.onPong.bind(this);
		this.onTimeout = this.onTimeout.bind(this);
	}
	
	start (client) {
		this.stop();
		this.client = client;
		this.client.on('pong', this.onPong);
		this.ping();
	}
	
	stop () {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.client) {
			this.client.off('pong', this.onPong);
			this.client = null;
		}
	}
	
	ping () {
		if (!this.client) {
			return;
		}
		
		this.timer = setTimeout(this.onTimeout, this.timeout);
		this.value = this.client.ping();
	}
	
	onPong (value) {
		if (value !== this.value) {
			return;
		}
		
		clearTimeout(this.timer);
		this.timer = setTimeout(this.ping, this.frequency);
	}
	
	onTimeout () {
		if (this.client) {
			this.client.close();
		}
		this.stop();
	}
}

module.exports = PingPong;
