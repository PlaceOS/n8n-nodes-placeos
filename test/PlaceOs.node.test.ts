import type { IExecuteFunctions } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { PlaceOs } from '../nodes/PlaceOs/PlaceOs.node';

type Response = { statusCode: number; body: unknown; headers?: Record<string, string> };

function context(parameters: Record<string, unknown>, responses: Response[], continueOnFail = false) {
	const ctx = mockDeep<IExecuteFunctions>();
	ctx.getInputData.mockReturnValue([{ json: {} }]);
	ctx.getNode.mockReturnValue({ name: 'PlaceOS', type: 'placeOs', typeVersion: 1 } as never);
	ctx.getTimezone.mockReturnValue('Australia/Sydney');
	ctx.continueOnFail.mockReturnValue(continueOnFail);
	ctx.getCredentials.mockResolvedValue({ baseUrl: 'https://placeos.example.com', apiKey: 'k' });
	ctx.getNodeParameter.mockImplementation(((name: string, _i: number, fallback?: unknown) => {
		const path = name.split('.');
		let value: unknown = parameters;
		for (const key of path) value = (value as Record<string, unknown> | undefined)?.[key];
		if (value && typeof value === 'object' && '__rl' in (value as object)) return (value as { value: unknown }).value;
		return value === undefined ? fallback : value;
	}) as never);
	const request = vi.fn();
	for (const response of responses) request.mockResolvedValueOnce({ headers: {}, ...response });
	ctx.helpers.httpRequestWithAuthentication.mockImplementation(request);
	return { ctx, request };
}

const system = { __rl: true, mode: 'id', value: 'sys-1' };

describe('PlaceOS node', () => {
	let node: PlaceOs;

	beforeEach(() => {
		node = new PlaceOs();
	});

	it('is usable as an AI tool and lists every resource', () => {
		expect(node.description.usableAsTool).toBe(true);
		const resource = node.description.properties.find((property) => property.name === 'resource');
		expect(resource?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'booking',
			'desk',
			'guest',
			'metadata',
			'module',
			'signal',
			'space',
			'system',
			'user',
			'zone',
		]);
	});

	it('simplifies systems from Get Many', async () => {
		const { ctx, request } = context({ resource: 'system', operation: 'getAll', returnAll: false, limit: 5, filters: { zoneIds: 'zone-a, zone-b' }, simplify: true }, [
			{ statusCode: 200, body: [{ id: 'sys-1', name: 'Boardroom', version: 3, playlists: [] }] },
		]);
		const [items] = await node.execute.call(ctx);
		expect(items).toEqual([{ json: { id: 'sys-1', name: 'Boardroom' }, pairedItem: { item: 0 } }]);
		expect(request.mock.calls[0][1].qs).toEqual({ zone_id: 'zone-a,zone-b', limit: 5 });
	});

	it('maps named arguments onto the function order before executing', async () => {
		const { ctx, request } = context(
			{
				resource: 'system',
				operation: 'execute',
				system,
				moduleSlug: 'Display_1',
				functionName: 'switch_to',
				argumentMode: 'named',
				arguments: { argument: [{ name: 'input', value: 'hdmi' }] },
			},
			[
				{ statusCode: 200, body: { switch_to: { arity: 1, order: ['input'], params: { input: { type: 'string' } } } } },
				{ statusCode: 200, body: '"HDMI"' },
			],
		);
		const [items] = await node.execute.call(ctx);
		expect(request.mock.calls[1][1]).toMatchObject({
			method: 'POST',
			url: 'https://placeos.example.com/api/engine/v2/systems/sys-1/Display_1/switch_to',
			body: '["hdmi"]',
		});
		expect(items[0].json).toEqual({ system_id: 'sys-1', module: 'Display', index: 1, function: 'switch_to', arguments: ['hdmi'], result: 'HDMI' });
	});

	it('resolves a room email to the system id first', async () => {
		const { ctx, request } = context(
			{ resource: 'system', operation: 'getModuleTypes', system: { __rl: true, mode: 'email', value: 'room@example.com' } },
			[
				{ statusCode: 200, body: { id: 'sys-9', name: 'Room' } },
				{ statusCode: 200, body: { Display: 2 } },
			],
		);
		const [items] = await node.execute.call(ctx);
		expect(request.mock.calls[0][1].url).toBe('https://placeos.example.com/api/engine/v2/systems/room%40example.com');
		expect(request.mock.calls[1][1].url).toBe('https://placeos.example.com/api/engine/v2/systems/sys-9/types');
		expect(items[0].json).toEqual({ system_id: 'sys-9', name: 'Display', count: 2, slugs: ['Display_1', 'Display_2'] });
	});

	it("creates a booking with times read in the workflow's time zone", async () => {
		const { ctx, request } = context(
			{
				resource: 'booking',
				operation: 'create',
				bookingType: 'desk',
				assetId: 'desk-1',
				bookingStart: '2026-10-24T09:00:00',
				bookingEnd: '2026-10-24T17:00:00',
				additionalFields: { zoneIds: 'zone-b,zone-l', extensionData: '{"source":"n8n"}' },
			},
			[{ statusCode: 201, body: { id: 5 } }],
		);
		await node.execute.call(ctx);
		const options = request.mock.calls[0][1];
		expect(options.url).toBe('https://placeos.example.com/api/staff/v1/bookings');
		expect(options.qs).toEqual({ utm_source: 'n8n' });
		expect(JSON.parse(options.body)).toEqual({
			booking_type: 'desk',
			asset_id: 'desk-1',
			asset_ids: ['desk-1'],
			booking_start: Date.parse('2026-10-24T09:00:00+11:00') / 1000,
			booking_end: Date.parse('2026-10-24T17:00:00+11:00') / 1000,
			timezone: 'Australia/Sydney',
			zones: ['zone-b', 'zone-l'],
			extension_data: { source: 'n8n' },
		});
	});

	it('refuses to delete metadata without a name', async () => {
		const { ctx, request } = context({ resource: 'metadata', operation: 'delete', parentId: 'zone-1', metadataName: ' ' }, []);
		await expect(node.execute.call(ctx)).rejects.toThrow("'Name' must not be empty");
		expect(request).not.toHaveBeenCalled();
	});

	it('returns the error as an item when Continue On Fail is set', async () => {
		const { ctx } = context({ resource: 'zone', operation: 'getAll', returnAll: true, filters: {} }, [{ statusCode: 403, body: '' }], true);
		const [items] = await node.execute.call(ctx);
		expect(items).toEqual([{ json: { error: 'The API key is not allowed to call GET /api/engine/v2/zones' }, pairedItem: { item: 0 } }]);
	});

	it('throws a NodeApiError with the item index otherwise', async () => {
		const { ctx } = context({ resource: 'booking', operation: 'get', bookingId: '7', simplify: true }, [
			{ statusCode: 404, body: { error: 'could not find booking with id: 7' } },
		]);
		await expect(node.execute.call(ctx)).rejects.toMatchObject({
			httpCode: '404',
			message: 'PlaceOS could not find the resource: could not find booking with id: 7',
		});
	});
});
