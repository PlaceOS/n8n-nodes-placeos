import type { ITriggerFunctions } from 'n8n-workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { PlaceOsTrigger } from '../nodes/PlaceOsTrigger/PlaceOsTrigger.node';
import { FakeSocket, flush } from './fakes';

const sensor = { sys: 'sys-1', mod: 'Sensor', index: 1, name: 'people' };

function context(mode: 'trigger' | 'manual', options: Record<string, unknown> = {}, types: unknown = { Sensor: 1 }) {
	const ctx = mockDeep<ITriggerFunctions>();
	const parameters: Record<string, unknown> = {
		system: 'sys-1',
		'bindings.binding': [{ moduleSlug: 'Sensor_1', statusKey: 'people' }],
		options,
	};
	ctx.getMode.mockReturnValue(mode);
	ctx.getNode.mockReturnValue({ name: 'PlaceOS Trigger' } as never);
	ctx.getCredentials.mockResolvedValue({ baseUrl: 'https://placeos.example.com', apiKey: 'id.secret' });
	ctx.getNodeParameter.mockImplementation(((name: string, fallback?: unknown) => parameters[name] ?? fallback) as never);
	ctx.helpers.httpRequestWithAuthentication.mockResolvedValue({ statusCode: 200, headers: {}, body: types } as never);
	ctx.helpers.returnJsonArray.mockImplementation(((rows: object[]) => rows.map((json) => ({ json }))) as never);
	return ctx;
}

async function start(ctx: ITriggerFunctions) {
	const node = new PlaceOsTrigger();
	const starting = node.trigger.call(ctx);
	await flush();
	const socket = FakeSocket.instances.at(-1) as FakeSocket;
	return { node, starting, socket };
}

function emitted(ctx: ReturnType<typeof context>) {
	return ctx.emit.mock.calls.map(([data]) => data[0][0].json);
}

describe('PlaceOS Trigger', () => {
	beforeEach(() => {
		FakeSocket.instances = [];
		vi.stubGlobal('WebSocket', FakeSocket);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('connects with the API key, binds and emits each change with the previous value', async () => {
		const ctx = context('trigger');
		const { starting, socket } = await start(ctx);
		expect(socket.url).toBe('wss://placeos.example.com/api/engine/v2/systems/control?api-key=id.secret');
		socket.open();
		socket.notify(sensor, 4);
		socket.acceptBinds();
		const response = await starting;
		expect(ctx.emit).not.toHaveBeenCalled();
		socket.notify(sensor, 4);
		socket.notify(sensor, 5);
		expect(emitted(ctx)).toEqual([
			expect.objectContaining({ module_slug: 'Sensor_1', status: 'people', value: 5, previous_value: 4, initial: false }),
		]);
		await response.closeFunction?.();
		expect(socket.closedWith?.code).toBe(1000);
	});

	it('emits the current value on start when asked to', async () => {
		const ctx = context('trigger', { emitInitialValue: true });
		const { starting, socket } = await start(ctx);
		socket.open();
		socket.notify(sensor, 4);
		socket.acceptBinds();
		await starting;
		expect(emitted(ctx)).toEqual([expect.objectContaining({ value: 4, previous_value: null, initial: true })]);
	});

	it('emits repeated values when Only on Change is off', async () => {
		const ctx = context('trigger', { onlyOnChange: false });
		const { starting, socket } = await start(ctx);
		socket.open();
		socket.notify(sensor, 1);
		socket.acceptBinds();
		await starting;
		socket.notify(sensor, 1);
		socket.notify(sensor, 1);
		expect(ctx.emit).toHaveBeenCalledTimes(2);
	});

	it('emits a value that changed while it was reconnecting, but not an unchanged one', async () => {
		vi.useFakeTimers();
		try {
			const ctx = context('trigger', {}, { Sensor: 1, Display: 1 });
			ctx.getNodeParameter.mockImplementation(((name: string, fallback?: unknown) =>
				({
					system: 'sys-1',
					'bindings.binding': [
						{ moduleSlug: 'Sensor_1', statusKey: 'people' },
						{ moduleSlug: 'Display_1', statusKey: 'power' },
					],
					options: {},
				})[name] ?? fallback) as never);
			const display = { sys: 'sys-1', mod: 'Display', index: 1, name: 'power' };
			const { starting, socket } = await start(ctx);
			socket.open();
			socket.notify(sensor, 4);
			socket.notify(display, true);
			socket.acceptBinds();
			const response = await starting;

			socket.drop();
			await vi.advanceTimersByTimeAsync(1000);
			const second = FakeSocket.instances.at(-1) as FakeSocket;
			expect(second).not.toBe(socket);
			second.open();
			second.notify(sensor, 6);
			second.notify(display, true);
			second.acceptBinds();
			await vi.advanceTimersByTimeAsync(0);

			expect(emitted(ctx)).toEqual([expect.objectContaining({ status: 'people', value: 6, previous_value: 4, initial: false })]);
			await response.closeFunction?.();
		} finally {
			vi.useRealTimers();
		}
	});

	it('fails activation for a module that is not in the system', async () => {
		const ctx = context('trigger', {}, { Display: 1 });
		const node = new PlaceOsTrigger();
		await expect(node.trigger.call(ctx)).rejects.toThrow("Module 'Sensor_1' is not in system sys-1");
		expect(FakeSocket.instances).toHaveLength(0);
	});

	it('fails activation when PlaceOS refuses a bind', async () => {
		const ctx = context('trigger');
		const { starting, socket } = await start(ctx);
		socket.open();
		socket.receive({ id: socket.binds()[0].id, type: 'error', code: 2, msg: 'denied' });
		await expect(starting).rejects.toThrow('PlaceOS refused to bind Sensor_1.people: denied (code 2)');
	});

	it('connects only when the test run starts, and emits the first value it gets', async () => {
		const ctx = context('manual');
		const node = new PlaceOsTrigger();
		const response = await node.trigger.call(ctx);
		expect(FakeSocket.instances).toHaveLength(0);
		const listening = response.manualTriggerFunction?.();
		await flush();
		const socket = FakeSocket.instances[0];
		socket.open();
		socket.notify(sensor, 7);
		socket.acceptBinds();
		await listening;
		socket.notify(sensor, 8);
		expect(emitted(ctx)).toEqual([expect.objectContaining({ value: 7, initial: true })]);
		await response.closeFunction?.();
	});
});
