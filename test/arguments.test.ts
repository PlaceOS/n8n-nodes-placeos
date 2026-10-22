import type { IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { orderNamedArguments, parseArgumentsJson } from '../nodes/PlaceOs/operations/arguments';

const context = mock<IExecuteFunctions>({ getNode: () => ({ name: 'PlaceOS' }) as never });

const mute = {
	order: ['state', 'index', 'layer'],
	params: {
		state: { type: 'boolean', default: true },
		index: { anyOf: [{ type: 'integer' }, { type: 'string' }], default: 0 },
		layer: { type: 'string', default: 'audio_video' },
	},
};

describe('orderNamedArguments', () => {
	it("puts arguments in the function's order and parses JSON values", () => {
		const args = orderNamedArguments.call(context, 'mute', mute, [
			{ name: 'index', value: '2' },
			{ name: 'state', value: 'false' },
		], 0);
		expect(args).toEqual([false, 2]);
	});

	it('fills a gap before the last given argument with its default', () => {
		expect(orderNamedArguments.call(context, 'mute', mute, [{ name: 'layer', value: 'audio' }], 0)).toEqual([
			true,
			0,
			'audio',
		]);
	});

	it('sends no arguments when none are given and all have defaults', () => {
		expect(orderNamedArguments.call(context, 'mute', mute, [], 0)).toEqual([]);
	});

	it('rejects unknown names and missing required arguments', () => {
		expect(() => orderNamedArguments.call(context, 'mute', mute, [{ name: 'nope', value: '1' }], 0)).toThrow(
			"'mute' has no argument named 'nope'",
		);
		const power = { order: ['state'], params: { state: { type: 'boolean' } } };
		expect(() => orderNamedArguments.call(context, 'power', power, [], 0)).toThrow("needs the argument 'state'");
	});
});

describe('parseArgumentsJson', () => {
	it('accepts a JSON array and rejects anything else', () => {
		expect(parseArgumentsJson.call(context, '[true, 3]', 0)).toEqual([true, 3]);
		expect(parseArgumentsJson.call(context, '', 0)).toEqual([]);
		expect(parseArgumentsJson.call(context, [1], 0)).toEqual([1]);
		expect(() => parseArgumentsJson.call(context, '{"a":1}', 0)).toThrow('must be a JSON array');
	});
});
