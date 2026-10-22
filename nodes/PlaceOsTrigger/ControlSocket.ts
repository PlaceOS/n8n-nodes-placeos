import { sleep } from 'n8n-workflow';

/** One status value to watch: module `mod` at 1-based `index` in system `sys`, status key `name`. */
export interface Binding {
	sys: string;
	mod: string;
	index: number;
	name: string;
}

export interface NotifyInfo {
	/** The value PlaceOS sends straight after a bind, the status as it was rather than a change. */
	snapshot: boolean;
	/** True when the bind belongs to a connection made after a drop. */
	reconnect: boolean;
}

export type Delay = (ms: number, signal: AbortSignal) => Promise<void>;

/** The parts of the WHATWG WebSocket this class uses. */
export interface WebSocketLike {
	readonly readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: SocketEvent) => void): void;
}

export interface SocketEvent {
	data?: unknown;
	code?: number;
	reason?: string;
	message?: string;
	error?: unknown;
}

export interface ControlSocketLogger {
	debug(message: string, meta?: object): void;
	warn(message: string, meta?: object): void;
}

export interface ControlSocketOptions {
	url: string;
	bindings: Binding[];
	onNotify: (binding: Binding, value: unknown, info: NotifyInfo) => void;
	/** Called once, after the reconnect attempts are used up. */
	onFatal: (error: Error) => void;
	logger?: ControlSocketLogger;
	pingIntervalMs?: number;
	bindTimeoutMs?: number;
	/** Wait before each reconnect attempt; the last entry repeats. */
	backoffMs?: number[];
	maxReconnects?: number;
	/** How long after a bind's success a first notify still counts as the snapshot. */
	snapshotWindowMs?: number;
	delay?: Delay;
	now?: () => number;
	createSocket?: (url: string) => WebSocketLike;
}

/** Resolves after `ms`, or rejects as soon as `signal` aborts. Works with every n8n-workflow `sleep` signature. */
export const abortableDelay: Delay = async (ms, signal) =>
	await new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		sleep(ms, signal).then(
			() => {
				signal.removeEventListener('abort', onAbort);
				resolve();
			},
			() => reject(signal.reason),
		);
	});

export function bindingKey(binding: { sys: string; mod: string; index: number; name: string }): string {
	return `${binding.sys}|${binding.mod}|${binding.index}|${binding.name}`;
}

/** The control socket URL for a PlaceOS base URL, authenticated with the API key query parameter. */
export function controlSocketUrl(baseUrl: string, apiKey: string): string {
	const url = new URL(`${baseUrl.replace(/\/+$/, '')}/api/engine/v2/systems/control`);
	url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
	url.searchParams.set('api-key', apiKey);
	return url.toString();
}

function redact(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.search = '';
		return parsed.toString();
	} catch {
		return '(invalid URL)';
	}
}

function messageText(data: unknown): string {
	if (typeof data === 'string') return data;
	if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
	if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data as Uint8Array);
	return String(data);
}

interface BindState {
	binding: Binding;
	seen: boolean;
	successAt?: number;
}

interface Connection {
	socket: WebSocketLike;
	controller: AbortController;
	reconnect: boolean;
	ready: boolean;
	dead: boolean;
	lastPong: number;
	pending: Map<number, BindState>;
	states: Map<string, BindState>;
}

const OPEN = 1;

/**
 * Keeps one PlaceOS control websocket open, binds the given status values and reports every notify.
 * Reconnects with backoff after a drop and rebinds; reports a fatal error once the attempts run out.
 */
export class ControlSocket {
	private readonly controller = new AbortController();

	private readonly delay: Delay;

	private readonly now: () => number;

	private readonly createSocket: (url: string) => WebSocketLike;

	private readonly pingIntervalMs: number;

	private readonly pongTimeoutMs: number;

	private readonly bindTimeoutMs: number;

	private readonly backoffMs: number[];

	private readonly maxReconnects: number;

	private readonly snapshotWindowMs: number;

	private readonly bindings: Binding[];

	private connection?: Connection;

	private nextId = 1;

	private attempts = 0;

	private reconnecting = false;

	private closed = false;

	constructor(private readonly options: ControlSocketOptions) {
		this.delay = options.delay ?? abortableDelay;
		this.now = options.now ?? (() => Date.now());
		this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
		this.pingIntervalMs = options.pingIntervalMs ?? 15000;
		this.pongTimeoutMs = 2 * this.pingIntervalMs;
		this.bindTimeoutMs = options.bindTimeoutMs ?? 10000;
		this.backoffMs = options.backoffMs?.length ? options.backoffMs : [1000, 2000, 4000, 8000, 16000, 30000];
		this.maxReconnects = options.maxReconnects ?? 10;
		this.snapshotWindowMs = options.snapshotWindowMs ?? 2000;
		const unique = new Map<string, Binding>();
		for (const binding of options.bindings) unique.set(bindingKey(binding), binding);
		this.bindings = [...unique.values()];
	}

	get isClosed(): boolean {
		return this.closed;
	}

	/** Opens the socket and resolves once every bind has succeeded. Rejects on a failed handshake, an error reply or a timeout. */
	async connect(): Promise<void> {
		await this.open(false);
	}

	/** Closes the socket and stops any reconnect. Safe to call more than once. */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.controller.abort(new Error('closed'));
		const connection = this.connection;
		if (connection) this.finish(connection, 1000, 'n8n deactivated');
	}

	private async open(reconnect: boolean): Promise<void> {
		if (this.closed) throw new Error('The PlaceOS connection was closed');
		const controller = new AbortController();
		const abortChild = () => controller.abort(new Error('closed'));
		this.controller.signal.addEventListener('abort', abortChild, { once: true });

		const socket = this.createSocket(this.options.url);
		const connection: Connection = {
			socket,
			controller,
			reconnect,
			ready: false,
			dead: false,
			lastPong: this.now(),
			pending: new Map(),
			states: new Map(),
		};
		this.connection = connection;

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				this.finish(connection, 4001, 'failed');
				reject(error);
			};
			const succeed = () => {
				if (settled) return;
				settled = true;
				connection.ready = true;
				void this.keepAlive(connection);
				resolve();
			};
			const lost = (detail: string) => {
				if (!settled) {
					fail(
						new Error(
							`Could not connect to the PlaceOS control socket at ${redact(this.options.url)} (${detail}). Check the Base URL and that the API key is valid.`,
						),
					);
					return;
				}
				this.dropped(connection, new Error(`The PlaceOS control socket closed (${detail})`));
			};

			socket.addEventListener('open', () => {
				try {
					connection.lastPong = this.now();
					for (const binding of this.bindings) {
						const id = this.nextId++;
						const state: BindState = { binding, seen: false };
						connection.pending.set(id, state);
						connection.states.set(bindingKey(binding), state);
						socket.send(JSON.stringify({ id, cmd: 'bind', ...binding }));
					}
					if (this.bindings.length === 0) succeed();
				} catch (error) {
					fail(error as Error);
				}
			});

			socket.addEventListener('message', (event) => {
				try {
					const text = messageText(event.data);
					if (text === 'pong') {
						connection.lastPong = this.now();
						return;
					}
					const frame = JSON.parse(text) as {
						id?: number;
						type?: string;
						value?: unknown;
						msg?: string;
						code?: number;
						meta?: { sys: string; mod: string; index: number; name: string };
					};
					if (frame.type === 'success' && typeof frame.id === 'number') {
						const state = connection.pending.get(frame.id);
						if (!state) return;
						state.successAt = this.now();
						connection.pending.delete(frame.id);
						if (connection.pending.size === 0) succeed();
						return;
					}
					if (frame.type === 'error' && typeof frame.id === 'number' && connection.pending.has(frame.id)) {
						const state = connection.pending.get(frame.id) as BindState;
						const { mod, index, name } = state.binding;
						fail(
							new Error(
								`PlaceOS refused to bind ${mod}_${index}.${name}: ${frame.msg ?? 'unknown error'} (code ${frame.code ?? '?'})`,
							),
						);
						return;
					}
					if (frame.type === 'notify' && frame.meta) {
						const state = connection.states.get(bindingKey(frame.meta));
						if (!state) return;
						const snapshot =
							!state.seen &&
							(state.successAt === undefined || this.now() - state.successAt <= this.snapshotWindowMs);
						state.seen = true;
						if (connection.dead || this.closed) return;
						this.options.onNotify(state.binding, frame.value, { snapshot, reconnect: connection.reconnect });
					}
				} catch (error) {
					this.options.logger?.warn('Ignored a PlaceOS control socket message', {
						error: (error as Error).message,
					});
				}
			});

			socket.addEventListener('error', (event) => {
				try {
					const detail = event.message || (event.error as Error | undefined)?.message || 'network error';
					lost(detail);
				} catch (error) {
					this.logError(error);
				}
			});

			socket.addEventListener('close', (event) => {
				try {
					lost(`close code ${event.code ?? 'unknown'}${event.reason ? `, ${event.reason}` : ''}`);
				} catch (error) {
					this.logError(error);
				}
			});

			this.delay(this.bindTimeoutMs, controller.signal).then(
				() => {
					if (!settled) {
						fail(
							new Error(
								`PlaceOS did not confirm the bindings within ${Math.round(this.bindTimeoutMs / 1000)} seconds`,
							),
						);
					}
				},
				() => {
					if (!settled && this.closed) fail(new Error('The PlaceOS connection was closed'));
				},
			);
		});
	}

	private logError(error: unknown): void {
		this.options.logger?.warn('PlaceOS control socket error', { error: (error as Error)?.message });
	}

	private finish(connection: Connection, code: number, reason: string): void {
		connection.dead = true;
		connection.controller.abort(new Error(reason));
		try {
			connection.socket.close(code, reason);
		} catch {
			// the socket is already closing or closed
		}
	}

	private async keepAlive(connection: Connection): Promise<void> {
		const { signal } = connection.controller;
		while (!signal.aborted) {
			try {
				await this.delay(this.pingIntervalMs, signal);
			} catch {
				return;
			}
			if (connection.dead) return;
			if (this.now() - connection.lastPong > this.pongTimeoutMs) {
				this.dropped(connection, new Error('PlaceOS stopped answering pings'));
				return;
			}
			try {
				if (connection.socket.readyState === OPEN) connection.socket.send('ping');
			} catch (error) {
				this.logError(error);
			}
		}
	}

	private dropped(connection: Connection, error: Error): void {
		if (connection.dead) return;
		this.finish(connection, 4000, 'dropped');
		if (this.closed || connection !== this.connection) return;
		this.options.logger?.warn('PlaceOS control socket dropped, reconnecting', { error: error.message });
		void this.reconnect(error);
	}

	private async reconnect(lastError: Error): Promise<void> {
		if (this.reconnecting) return;
		this.reconnecting = true;
		let error = lastError;
		try {
			while (!this.closed) {
				if (this.attempts >= this.maxReconnects) {
					this.closed = true;
					this.controller.abort(new Error('gave up'));
					this.options.onFatal(error);
					return;
				}
				const wait = this.backoffMs[Math.min(this.attempts, this.backoffMs.length - 1)];
				this.attempts++;
				try {
					await this.delay(wait, this.controller.signal);
				} catch {
					return;
				}
				try {
					await this.open(true);
					this.attempts = 0;
					this.options.logger?.debug('PlaceOS control socket reconnected');
					return;
				} catch (reason) {
					error = reason as Error;
				}
			}
		} finally {
			this.reconnecting = false;
		}
	}
}
