import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import {
	mapPlaceOsError,
	nextPageFromLink,
	placeOsRequest,
	placeOsRequestList,
} from '../nodes/PlaceOs/transport';

function context(responses: Array<{ statusCode: number; body: unknown; headers?: Record<string, string> }>) {
	const ctx = mockDeep<IExecuteFunctions>();
	ctx.getNode.mockReturnValue({ name: 'PlaceOS' } as never);
	ctx.getCredentials.mockResolvedValue({ baseUrl: 'https://placeos.example.com/', apiKey: 'k', ignoreSSLIssues: false });
	const request = vi.fn();
	for (const response of responses) request.mockResolvedValueOnce({ headers: {}, ...response });
	ctx.helpers.httpRequestWithAuthentication.mockImplementation(request);
	return { ctx, request };
}

describe('mapPlaceOsError', () => {
	it('explains an empty 403', () => {
		const { message, description } = mapPlaceOsError(403, undefined, 'GET', '/api/engine/v2/zones');
		expect(message).toBe('The API key is not allowed to call GET /api/engine/v2/zones');
		expect(description).toContain('Support permission');
	});

	it('names the clashing bookings on a 409', () => {
		expect(mapPlaceOsError(409, { error: 'Conflicting booking', bookings: [{ id: 7 }, { id: 9 }] }, 'POST', '/x')).toEqual({
			message: 'The booking clashes with an existing booking',
			description: 'Clashing booking IDs: 7, 9',
		});
	});

	it('lists validation failures on a 422', () => {
		const { message } = mapPlaceOsError(
			422,
			{ error: 'error validating booking data', failures: [{ field: 'booking_end', reason: 'must be after start' }] },
			'POST',
			'/x',
		);
		expect(message).toBe('PlaceOS rejected the data: booking_end: must be after start');
	});

	it('covers the Staff API tenant and calendar cases', () => {
		expect(mapPlaceOsError(501, { error: 'domain does not have a tenant configured' }, 'GET', '/x').message).toBe(
			'domain does not have a tenant configured',
		);
		expect(mapPlaceOsError(511, {}, 'GET', '/x').message).toContain('sign in');
		expect(mapPlaceOsError(410, { limit: 1 }, 'POST', '/x')).toEqual({
			message: 'The booking limit for this user has been reached',
			description: 'Limit: 1',
		});
	});

	it('uses the body error or message otherwise', () => {
		expect(mapPlaceOsError(500, { message: 'boom' }, 'GET', '/x').message).toBe('boom');
		expect(mapPlaceOsError(401, { error: 'API key has expired' }, 'GET', '/x').message).toBe(
			'PlaceOS rejected the API key: API key has expired',
		);
	});
});

describe('nextPageFromLink', () => {
	it('reads relative and absolute next links', () => {
		expect(nextPageFromLink('</api/engine/v2/systems/?offset=100&limit=100>; rel="next"')).toBe(
			'/api/engine/v2/systems/?offset=100&limit=100',
		);
		expect(nextPageFromLink('<https://x.example.com/api/staff/v1/bookings?offset=5>; rel="next"')).toBe(
			'/api/staff/v1/bookings?offset=5',
		);
		expect(nextPageFromLink(undefined)).toBeUndefined();
		expect(nextPageFromLink('</a>; rel="prev"')).toBeUndefined();
	});
});

describe('placeOsRequest', () => {
	it('sends the base URL without a trailing slash, JSON bodies as text, and returns the parsed body', async () => {
		const { ctx, request } = context([{ statusCode: 200, body: 'true' }]);
		const response = await placeOsRequest.call(ctx, 'POST', '/api/engine/v2/systems/s/Display_1/power', { body: [] });
		expect(response.body).toBe(true);
		const [credential, options] = request.mock.calls[0];
		expect(credential).toBe('placeOsApi');
		expect(options).toMatchObject({
			method: 'POST',
			url: 'https://placeos.example.com/api/engine/v2/systems/s/Display_1/power',
			body: '[]',
			json: false,
			ignoreHttpStatusErrors: true,
			returnFullResponse: true,
		});
	});

	it('throws a NodeApiError with the HTTP code', async () => {
		const { ctx } = context([{ statusCode: 403, body: '' }]);
		const error = await placeOsRequest.call(ctx, 'GET', '/api/engine/v2/zones').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).httpCode).toBe('403');
		expect((error as NodeApiError).message).toContain('not allowed');
	});
});

describe('placeOsRequestList', () => {
	it('follows Link headers until the last page', async () => {
		const { ctx, request } = context([
			{ statusCode: 200, body: [{ id: 1 }, { id: 2 }], headers: { link: '</api/engine/v2/zones/?offset=2&limit=2>; rel="next"' } },
			{ statusCode: 200, body: [{ id: 3 }] },
		]);
		const rows = await placeOsRequestList.call(ctx, '/api/engine/v2/zones', { tags: 'level' }, undefined, 2);
		expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
		expect(request.mock.calls[0][1].qs).toEqual({ tags: 'level', limit: 2 });
		expect(request.mock.calls[1][1].url).toBe('https://placeos.example.com/api/engine/v2/zones/?offset=2&limit=2');
	});

	it('stops at the limit', async () => {
		const { ctx, request } = context([
			{ statusCode: 200, body: [{ id: 1 }, { id: 2 }], headers: { link: '</next>; rel="next"' } },
		]);
		const rows = await placeOsRequestList.call(ctx, '/api/engine/v2/zones', {}, 2);
		expect(rows).toHaveLength(2);
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][1].qs).toEqual({ limit: 2 });
	});
});
