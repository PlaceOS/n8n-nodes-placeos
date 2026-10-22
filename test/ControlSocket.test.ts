import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Binding, NotifyInfo } from '../nodes/PlaceOsTrigger/ControlSocket';
import { ControlSocket, controlSocketUrl } from '../nodes/PlaceOsTrigger/ControlSocket';
import { FakeSocket, flush, manualDelay } from './fakes';

const sensor: Binding = { sys: 'sys-1', mod: 'Sensor', index: 1, name: 'people' };
const display: Binding = { sys: 'sys-1', mod: 'Display', index: 1, name: 'power' };

function setup(overrides: Partial<ConstructorParameters<typeof ControlSocket>[0]> = {}) {
	FakeSocket.instances = [];
	const timer = manualDelay();
	let clock = 1_000_000;
	const notices: Array<{ binding: Binding; value: unknown; info: NotifyInfo }> = [];
	const onFatal = vi.fn();
	const socket = new ControlSocket({
		url: 'wss://placeos.example.com/api/engine/v2/systems/control?api-key=secret',
		bindings: [sensor, display],
		onNotify: (binding, value, info) => notices.push({ binding, value, info }),
		onFatal,
		delay: timer.delay,
		now: () => clock,
		createSocket: (url) => new FakeSocket(url),
		pingIntervalMs: 15000,
		bindTimeoutMs: 10000,
		backoffMs: [1000, 2000],
		maxReconnects: 3,
		...overrides,
	});
	return {
		socket,
		timer,
		notices,
		onFatal,
		advance: (ms: number) => {
			clock += ms;
		},
		current: () => FakeSocket.instances[FakeSocket.instances.length - 1],
	};
}

async function connected(t: ReturnType<typeof setup>) {
	const connecting = t.socket.connect();
	t.current().open();
	t.current().acceptBinds();
	await connecting;
}

describe('controlSocketUrl', () => {
	it('swaps the scheme and adds the API key', () => {
		expect(controlSocketUrl('https://placeos.example.com/', 'id.secret')).toBe(
			'wss://placeos.example.com/api/engine/v2/systems/control?api-key=id.secret',
		);
		expect(controlSocketUrl('http://localhost:8080', 'k')).toBe('ws://localhost:8080/api/engine/v2/systems/control?api-key=k');
	});
});

describe('ControlSocket', () => {
	let t: ReturnType<typeof setup>;

	beforeEach(() => {
		t = setup();
	});

	it('binds every status value with integer ids and resolves once all succeed', async () => {
		const connecting = t.socket.connect();
		t.current().open();
		const binds = t.current().binds();
		expect(binds.map((bind) => [bind.cmd, bind.mod, bind.name])).toEqual([
			['bind', 'Sensor', 'people'],
			['bind', 'Display', 'power'],
		]);
		expect(binds.every((bind) => Number.isInteger(bind.id))).toBe(true);
		t.current().acceptBinds();
		await expect(connecting).resolves.toBeUndefined();
	});

	it('marks the value sent around the bind as the snapshot, even before the success frame', async () => {
		const connecting = t.socket.connect();
		t.current().open();
		t.current().notify(sensor, 4);
		t.current().acceptBinds();
		await connecting;
		t.current().notify(display, true);
		t.advance(5000);
		t.current().notify(sensor, 5);
		expect(t.notices.map(({ binding, value, info }) => [binding.name, value, info.snapshot])).toEqual([
			['people', 4, true],
			['power', true, true],
			['people', 5, false],
		]);
	});

	it('treats a first notify long after the bind as a change', async () => {
		await connected(t);
		t.advance(3000);
		t.current().notify(sensor, 1);
		expect(t.notices[0].info.snapshot).toBe(false);
	});

	it('rejects when PlaceOS refuses a bind', async () => {
		const connecting = t.socket.connect();
		t.current().open();
		const [first] = t.current().binds();
		t.current().receive({ id: first.id, type: 'error', code: 2, msg: 'attempted to access protected module' });
		await expect(connecting).rejects.toThrow('PlaceOS refused to bind Sensor_1.people: attempted to access protected module (code 2)');
	});

	it('rejects when the handshake fails, without leaking the API key', async () => {
		const connecting = t.socket.connect();
		t.current().drop(1002);
		const error = await connecting.catch((e: Error) => e);
		expect(String(error)).toContain('close code 1002');
		expect(String(error)).not.toContain('secret');
	});

	it('rejects when the binds are not confirmed in time', async () => {
		const connecting = t.socket.connect();
		t.current().open();
		t.timer.release(10000);
		await expect(connecting).rejects.toThrow('did not confirm the bindings within 10 seconds');
	});

	it('pings on the interval and keeps the connection while pongs arrive', async () => {
		await connected(t);
		t.advance(15000);
		t.timer.release(15000);
		await flush();
		expect(t.current().sent.filter((data) => data === 'ping')).toHaveLength(1);
		t.current().receive('pong');
		t.advance(15000);
		t.timer.release(15000);
		await flush();
		expect(t.current().readyState).toBe(1);
		expect(FakeSocket.instances).toHaveLength(1);
	});

	it('reconnects and rebinds after the pongs stop, flagging the new snapshot', async () => {
		await connected(t);
		t.advance(31000);
		t.timer.release(15000);
		await flush();
		expect(FakeSocket.instances[0].closedWith?.reason).toBe('dropped');
		expect(t.timer.release(1000)).toBe(true);
		await flush();
		const second = t.current();
		expect(second).not.toBe(FakeSocket.instances[0]);
		second.open();
		second.notify(sensor, 9);
		second.acceptBinds();
		await flush();
		expect(t.notices.at(-1)).toMatchObject({ value: 9, info: { snapshot: true, reconnect: true } });
	});

	it('reconnects after a drop with backoff and resets the attempts once connected', async () => {
		await connected(t);
		t.current().drop();
		expect(t.timer.release(1000)).toBe(true);
		await flush();
		t.current().drop();
		await flush();
		expect(t.timer.release(2000)).toBe(true);
		await flush();
		t.current().open();
		t.current().acceptBinds();
		await flush();
		t.current().drop();
		await flush();
		expect(t.timer.release(1000)).toBe(true);
		expect(t.onFatal).not.toHaveBeenCalled();
	});

	it('reports a fatal error once the reconnect attempts are used up', async () => {
		await connected(t);
		t.current().drop();
		for (const wait of [1000, 2000, 2000]) {
			expect(t.timer.release(wait)).toBe(true);
			await flush();
			t.current().drop();
			await flush();
		}
		expect(t.onFatal).toHaveBeenCalledTimes(1);
		expect(t.socket.isClosed).toBe(true);
	});

	it('hands over at the first drop when reconnects are disabled', async () => {
		t = setup({ maxReconnects: 0 });
		await connected(t);
		t.current().drop();
		await flush();
		expect(t.onFatal).toHaveBeenCalledTimes(1);
	});

	it('closes cleanly and does not reconnect', async () => {
		await connected(t);
		t.socket.close();
		t.socket.close();
		await flush();
		expect(t.current().closedWith).toEqual({ code: 1000, reason: 'n8n deactivated' });
		expect(t.timer.waits).toHaveLength(0);
		t.current().notify(sensor, 1);
		expect(t.notices).toHaveLength(0);
		expect(FakeSocket.instances).toHaveLength(1);
	});

	it('ignores frames it cannot parse', async () => {
		const warn = vi.fn();
		t = setup({ logger: { debug: vi.fn(), warn } });
		await connected(t);
		t.current().receive('not json');
		expect(warn).toHaveBeenCalled();
		expect(t.notices).toHaveLength(0);
	});
});
