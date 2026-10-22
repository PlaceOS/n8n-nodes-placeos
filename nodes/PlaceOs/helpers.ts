import type { IDataObject } from 'n8n-workflow';

/** Splits a module slug such as `Display_2` into its class name and 1-based index, as PlaceOS does. */
export function splitSlug(slug: string): { mod: string; index: number } {
	const trimmed = slug.trim();
	const at = trimmed.lastIndexOf('_');
	if (at > 0) {
		const suffix = trimmed.slice(at + 1);
		if (/^\d+$/.test(suffix)) {
			return { mod: trimmed.slice(0, at), index: parseInt(suffix, 10) };
		}
	}
	return { mod: trimmed, index: 1 };
}

export function moduleSlug(mod: string, index: number): string {
	return `${mod}_${index}`;
}

/** Expands `{Display: 2, Sensor: 1}` from the system types route into `Display_1, Display_2, Sensor_1`. */
export function expandModuleTypes(types: IDataObject): string[] {
	const slugs: string[] = [];
	for (const name of Object.keys(types).sort()) {
		const count = Number(types[name]) || 0;
		for (let index = 1; index <= count; index++) slugs.push(moduleSlug(name, index));
	}
	return slugs;
}

/** Parses a value that should be JSON, returning the raw string when it is not. */
export function parseLooseJson(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	if (trimmed === '') return value;
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

/** Module state hashes hold every value as a JSON string; this parses each one. */
export function parseStateHash(state: unknown): IDataObject {
	const result: IDataObject = {};
	if (!state || typeof state !== 'object' || Array.isArray(state)) return result;
	for (const [key, value] of Object.entries(state as IDataObject)) {
		result[key] = parseLooseJson(value) as IDataObject[keyof IDataObject];
	}
	return result;
}

export function pick(record: IDataObject, fields: string[]): IDataObject {
	const result: IDataObject = {};
	for (const field of fields) {
		if (record[field] !== undefined) result[field] = record[field];
	}
	return result;
}

export function splitList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter((entry) => entry !== '');
	if (typeof value !== 'string') return [];
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

/**
 * Builds the Staff API's extension data filter, `{key:value,other.nested:value}`.
 * PlaceOS compares every value as text, so number and boolean values never match.
 */
export function extensionDataFilter(data: IDataObject): string | undefined {
	const entries: string[] = [];
	const walk = (prefix: string, value: unknown) => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			for (const [key, child] of Object.entries(value as IDataObject)) {
				walk(prefix ? `${prefix}.${key.replace(/\./g, '\\.')}` : key.replace(/\./g, '\\.'), child);
			}
			return;
		}
		entries.push(`${prefix}:${String(value)}`);
	};
	walk('', data);
	return entries.length ? `{${entries.join(',')}}` : undefined;
}

/** Removes keys whose value is undefined, null or an empty string. */
export function compact(record: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null || value === '') continue;
		result[key] = value;
	}
	return result;
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
	const format = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	const parts: Record<string, number> = {};
	for (const part of format.formatToParts(new Date(utcMs))) {
		if (part.type !== 'literal') parts[part.type] = parseInt(part.value, 10);
	}
	const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
	return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/**
 * Converts an n8n date/time parameter value to unix seconds.
 * Accepts epoch numbers (seconds or milliseconds), Luxon DateTime and Date objects,
 * ISO strings with an offset, and strings without one, which are read in `timeZone`.
 * Returns undefined for empty values.
 */
export function toEpochSeconds(value: unknown, timeZone: string): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'number') return Math.floor(value > 1e11 ? value / 1000 : value);
	if (value instanceof Date) return Math.floor(value.getTime() / 1000);
	if (typeof value === 'object') {
		const candidate = value as { toSeconds?: () => number; toMillis?: () => number; toISO?: () => string };
		if (typeof candidate.toSeconds === 'function') return Math.floor(candidate.toSeconds());
		if (typeof candidate.toMillis === 'function') return Math.floor(candidate.toMillis() / 1000);
		if (typeof candidate.toISO === 'function') return toEpochSeconds(candidate.toISO(), timeZone);
		return undefined;
	}
	const text = String(value).trim();
	if (/^\d+(\.\d+)?$/.test(text)) return toEpochSeconds(Number(text), timeZone);
	const local = text.match(LOCAL_DATE_TIME);
	if (local) {
		const [, year, month, day, hour = '0', minute = '0', second = '0'] = local;
		const guess = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
		let result = guess - zoneOffsetMs(guess, timeZone);
		const corrected = guess - zoneOffsetMs(result, timeZone);
		if (corrected !== result) result = corrected;
		return Math.floor(result / 1000);
	}
	const parsed = Date.parse(text);
	if (Number.isNaN(parsed)) throw new Error(`'${text}' is not a valid date and time`);
	return Math.floor(parsed / 1000);
}
