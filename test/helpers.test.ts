import { describe, expect, it } from 'vitest';

import {
	compact,
	expandModuleTypes,
	extensionDataFilter,
	parseLooseJson,
	parseStateHash,
	splitList,
	splitSlug,
	toEpochSeconds,
} from '../nodes/PlaceOs/helpers';

describe('splitSlug', () => {
	it('splits the index off the last underscore', () => {
		expect(splitSlug('Display_2')).toEqual({ mod: 'Display', index: 2 });
		expect(splitSlug('Display')).toEqual({ mod: 'Display', index: 1 });
		expect(splitSlug('My_Display')).toEqual({ mod: 'My_Display', index: 1 });
		expect(splitSlug('My_Display_3')).toEqual({ mod: 'My_Display', index: 3 });
		expect(splitSlug(' Sensor_1 ')).toEqual({ mod: 'Sensor', index: 1 });
	});
});

describe('expandModuleTypes', () => {
	it('lists one slug per module, sorted by class name', () => {
		expect(expandModuleTypes({ Sensor: 1, Display: 2 })).toEqual(['Display_1', 'Display_2', 'Sensor_1']);
	});
});

describe('parseStateHash', () => {
	it('parses every JSON encoded value and keeps text that is not JSON', () => {
		expect(parseStateHash({ people: '4', presence: 'true', input: '"HDMI2"', raw: 'not json', obj: '{"a":1}' })).toEqual({
			people: 4,
			presence: true,
			input: 'HDMI2',
			raw: 'not json',
			obj: { a: 1 },
		});
		expect(parseStateHash(null)).toEqual({});
	});
});

describe('parseLooseJson', () => {
	it('returns parsed JSON or the original text', () => {
		expect(parseLooseJson('true')).toBe(true);
		expect(parseLooseJson('3')).toBe(3);
		expect(parseLooseJson('hdmi')).toBe('hdmi');
		expect(parseLooseJson('')).toBe('');
	});
});

describe('splitList and compact', () => {
	it('splits comma separated text and drops blanks', () => {
		expect(splitList(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
		expect(splitList(undefined)).toEqual([]);
	});

	it('drops empty values', () => {
		expect(compact({ a: 1, b: '', c: undefined, d: null, e: false })).toEqual({ a: 1, e: false });
	});
});

describe('toEpochSeconds', () => {
	it('accepts seconds and milliseconds', () => {
		expect(toEpochSeconds(1792792800, 'UTC')).toBe(1792792800);
		expect(toEpochSeconds(1792792800123, 'UTC')).toBe(1792792800);
		expect(toEpochSeconds('1792792800', 'UTC')).toBe(1792792800);
	});

	it('accepts Luxon-like and Date objects', () => {
		expect(toEpochSeconds({ toSeconds: () => 1792792800.9 }, 'UTC')).toBe(1792792800);
		expect(toEpochSeconds(new Date('2026-10-23T22:00:00Z'), 'UTC')).toBe(1792792800);
	});

	it('uses the offset of an ISO string', () => {
		expect(toEpochSeconds('2026-10-24T09:00:00+11:00', 'UTC')).toBe(1792792800);
		expect(toEpochSeconds('2026-10-23T22:00:00Z', 'Australia/Sydney')).toBe(1792792800);
	});

	it('reads a string without an offset in the given time zone, across daylight saving', () => {
		// AEDT (+11)
		expect(toEpochSeconds('2026-10-24T09:00:00', 'Australia/Sydney')).toBe(Date.parse('2026-10-24T09:00:00+11:00') / 1000);
		// AEST (+10)
		expect(toEpochSeconds('2026-07-01T09:00', 'Australia/Sydney')).toBe(Date.parse('2026-07-01T09:00:00+10:00') / 1000);
		expect(toEpochSeconds('2026-07-01', 'Europe/London')).toBe(Date.parse('2026-07-01T00:00:00+01:00') / 1000);
	});

	it('returns undefined for empty values and throws for nonsense', () => {
		expect(toEpochSeconds('', 'UTC')).toBeUndefined();
		expect(toEpochSeconds(undefined, 'UTC')).toBeUndefined();
		expect(() => toEpochSeconds('next tuesday', 'UTC')).toThrow('not a valid date');
	});
});

describe('extensionDataFilter', () => {
	it('writes the text form PlaceOS expects, with dotted keys for nested objects', () => {
		expect(extensionDataFilter({ source: 'kiosk' })).toBe('{source:kiosk}');
		expect(extensionDataFilter({ a: 'x', nested: { b: 'y' } })).toBe('{a:x,nested.b:y}');
		expect(extensionDataFilter({ 'dot.key': 'z' })).toBe('{dot\\.key:z}');
		expect(extensionDataFilter({})).toBeUndefined();
	});
});
