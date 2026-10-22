import type { Delay, SocketEvent, WebSocketLike } from '../nodes/PlaceOsTrigger/ControlSocket';

type Listener = (event: SocketEvent) => void;

/** An in-memory WebSocket the tests drive by hand. */
export class FakeSocket implements WebSocketLike {
	static instances: FakeSocket[] = [];

	readyState = 0;

	sent: string[] = [];

	closedWith?: { code?: number; reason?: string };

	private listeners: Record<string, Listener[]> = { open: [], message: [], close: [], error: [] };

	constructor(readonly url: string) {
		FakeSocket.instances.push(this);
	}

	addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: Listener): void {
		this.listeners[type].push(listener);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(code?: number, reason?: string): void {
		if (this.readyState === 3) return;
		this.readyState = 3;
		this.closedWith = { code, reason };
		this.emit('close', { code, reason });
	}

	emit(type: string, event: SocketEvent): void {
		for (const listener of this.listeners[type]) listener(event);
	}

	open(): void {
		this.readyState = 1;
		this.emit('open', {});
	}

	receive(frame: unknown): void {
		this.emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
	}

	drop(code = 1006): void {
		this.readyState = 3;
		this.emit('close', { code });
	}

	binds(): Array<{ id: number; cmd: string; sys: string; mod: string; index: number; name: string }> {
		return this.sent.filter((data) => data !== 'ping').map((data) => JSON.parse(data));
	}

	/** Answers every bind sent so far with success. */
	acceptBinds(): void {
		for (const bind of this.binds()) {
			this.receive({ id: bind.id, type: 'success', meta: { sys: bind.sys, mod: bind.mod, index: bind.index, name: bind.name } });
		}
	}

	notify(meta: { sys: string; mod: string; index: number; name: string }, value: unknown): void {
		this.receive({ id: 1, type: 'notify', value, meta });
	}
}

interface Wait {
	ms: number;
	resolve: () => void;
}

/** A delay the test releases by hand, so keepalive and backoff run without real timers. */
export function manualDelay() {
	const waits: Wait[] = [];
	const delay: Delay = async (ms, signal) =>
		await new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			const wait: Wait = { ms, resolve };
			waits.push(wait);
			signal.addEventListener(
				'abort',
				() => {
					const at = waits.indexOf(wait);
					if (at >= 0) waits.splice(at, 1);
					reject(signal.reason);
				},
				{ once: true },
			);
		});
	return {
		delay,
		waits,
		/** Resolves the oldest pending wait of `ms`; returns whether there was one. */
		release(ms: number): boolean {
			const at = waits.findIndex((wait) => wait.ms === ms);
			if (at < 0) return false;
			const [wait] = waits.splice(at, 1);
			wait.resolve();
			return true;
		},
	};
}

export async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}
