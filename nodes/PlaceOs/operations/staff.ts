import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { compact, extensionDataFilter, parseLooseJson, pick, splitList, toEpochSeconds } from '../helpers';
import { placeOsApiRequest, placeOsRequestList, STAFF } from '../transport';
import { jsonObject } from './engine';
import type { OperationHandler } from './types';

export const BOOKING_SIMPLE_FIELDS = [
	'id',
	'booking_type',
	'asset_id',
	'booking_start',
	'booking_end',
	'timezone',
	'title',
	'user_email',
	'zones',
	'current_state',
];

const UTM = { utm_source: 'n8n' };

function listLimit(this: IExecuteFunctions, i: number): number | undefined {
	return (this.getNodeParameter('returnAll', i) as boolean) ? undefined : (this.getNodeParameter('limit', i) as number);
}

function epoch(this: IExecuteFunctions, value: unknown, label: string, i: number, timeZone?: string): number | undefined {
	try {
		return toEpochSeconds(value, timeZone || this.getTimezone());
	} catch (error) {
		throw new NodeOperationError(this.getNode(), `'${label}': ${(error as Error).message}`, { itemIndex: i });
	}
}

function requiredEpoch(this: IExecuteFunctions, name: string, label: string, i: number, timeZone?: string): number {
	const value = epoch.call(this, this.getNodeParameter(name, i), label, i, timeZone);
	if (value === undefined) {
		throw new NodeOperationError(this.getNode(), `'${label}' is required`, { itemIndex: i });
	}
	return value;
}

function bookingType(this: IExecuteFunctions, i: number): string {
	const type = this.getNodeParameter('bookingType', i) as string;
	if (type !== 'custom') return type;
	const custom = (this.getNodeParameter('bookingTypeCustom', i) as string).trim();
	if (custom === '') {
		throw new NodeOperationError(this.getNode(), "'Custom Booking Type' must not be empty", { itemIndex: i });
	}
	return custom;
}

function bookingId(this: IExecuteFunctions, i: number): string {
	return encodeURIComponent(String(this.getNodeParameter('bookingId', i)).trim());
}

function jsonArray(this: IExecuteFunctions, value: unknown, label: string, i: number): unknown[] {
	const parsed = typeof value === 'string' ? parseLooseJson(value === '' ? '[]' : value) : value;
	if (!Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `'${label}' must be a JSON array`, { itemIndex: i });
	}
	return parsed;
}

/** Maps the shared booking fields of Additional Fields or Update Fields onto Booking JSON keys. */
function bookingBody(this: IExecuteFunctions, fields: IDataObject, i: number, timeZone?: string): IDataObject {
	const body: IDataObject = {};
	if (fields.title !== undefined) body.title = fields.title;
	if (fields.description !== undefined) body.description = fields.description;
	if (fields.userEmail) body.user_email = fields.userEmail;
	if (fields.userId) body.user_id = fields.userId;
	if (fields.userName) body.user_name = fields.userName;
	if (fields.department) body.department = fields.department;
	if (fields.permission) body.permission = fields.permission;
	if (fields.allDay !== undefined) body.all_day = fields.allDay;
	if (fields.zoneIds !== undefined) body.zones = splitList(fields.zoneIds);
	if (fields.assetIds) {
		const assets = splitList(fields.assetIds);
		if (assets.length) {
			body.asset_ids = assets;
			body.asset_id = assets[0];
		}
	}
	if (fields.assetId) {
		body.asset_id = fields.assetId;
		if (!body.asset_ids) body.asset_ids = [fields.assetId];
	}
	if (fields.extensionData !== undefined) {
		body.extension_data = jsonObject.call(this, fields.extensionData, 'Extension Data (JSON)', i);
	}
	if (fields.attendees !== undefined) {
		body.attendees = jsonArray.call(this, fields.attendees, 'Attendees (JSON)', i) as IDataObject[];
	}
	if (fields.bookingStart) body.booking_start = epoch.call(this, fields.bookingStart, 'Start', i, timeZone);
	if (fields.bookingEnd) body.booking_end = epoch.call(this, fields.bookingEnd, 'End', i, timeZone);
	return body;
}

function simplifyBooking(this: IExecuteFunctions, i: number, booking: IDataObject): IDataObject {
	return (this.getNodeParameter('simplify', i) as boolean) ? pick(booking, BOOKING_SIMPLE_FIELDS) : booking;
}

function bookingAction(path: string, qs: IDataObject = {}): OperationHandler {
	return async function (i) {
		return (await placeOsApiRequest.call(this, 'POST', `${STAFF}/bookings/${bookingId.call(this, i)}/${path}`, {
			qs: { ...qs, ...UTM },
		})) as IDataObject;
	};
}

export const bookingHandlers: Record<string, OperationHandler> = {
	async getAll(i) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs = compact({
			type: bookingType.call(this, i),
			period_start: epoch.call(this, filters.periodStart, 'Period Start', i),
			period_end: epoch.call(this, filters.periodEnd, 'Period End', i),
			zones: splitList(filters.zoneIds).join(',') || undefined,
			email: filters.userEmail,
			approved: filters.approved,
			rejected: filters.rejected,
			checked_in: filters.checkedIn,
			state: filters.state,
			department: filters.department,
			include_deleted: filters.includeDeleted ? true : undefined,
		});
		if (filters.extensionData !== undefined) {
			const data = jsonObject.call(this, filters.extensionData, 'Extension Data (JSON)', i);
			const filter = extensionDataFilter(data);
			if (filter) qs.extension_data = filter;
		}
		const bookings = await placeOsRequestList.call(this, `${STAFF}/bookings`, qs, listLimit.call(this, i));
		return bookings.map((booking) => simplifyBooking.call(this, i, booking));
	},

	async get(i) {
		const booking = (await placeOsApiRequest.call(this, 'GET', `${STAFF}/bookings/${bookingId.call(this, i)}`)) as IDataObject;
		return simplifyBooking.call(this, i, booking);
	},

	async create(i) {
		const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const timeZone = (fields.timezone as string) || this.getTimezone();
		const body: IDataObject = {
			booking_type: bookingType.call(this, i),
			asset_id: (this.getNodeParameter('assetId', i) as string).trim(),
			booking_start: requiredEpoch.call(this, 'bookingStart', 'Start', i, timeZone),
			booking_end: requiredEpoch.call(this, 'bookingEnd', 'End', i, timeZone),
			timezone: timeZone,
		};
		body.asset_ids = [body.asset_id];
		Object.assign(body, bookingBody.call(this, fields, i, timeZone));
		return (await placeOsApiRequest.call(this, 'POST', `${STAFF}/bookings`, { qs: UTM, body })) as IDataObject;
	},

	async update(i) {
		const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
		const body = bookingBody.call(this, fields, i);
		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), "Add at least one field under 'Update Fields'", { itemIndex: i });
		}
		return (await placeOsApiRequest.call(this, 'PATCH', `${STAFF}/bookings/${bookingId.call(this, i)}`, {
			qs: UTM,
			body,
		})) as IDataObject;
	},

	async delete(i) {
		await placeOsApiRequest.call(this, 'DELETE', `${STAFF}/bookings/${bookingId.call(this, i)}`, { qs: UTM });
		return { deleted: true };
	},

	approve: bookingAction('approve'),
	reject: bookingAction('reject'),
	checkIn: bookingAction('check_in', { state: true }),
	checkOut: bookingAction('check_in', { state: false }),
};

export const guestHandlers: Record<string, OperationHandler> = {
	async getAll(i) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const periodStart = epoch.call(this, filters.periodStart, 'Period Start', i);
		const periodEnd = epoch.call(this, filters.periodEnd, 'Period End', i);
		if ((periodStart === undefined) !== (periodEnd === undefined)) {
			throw new NodeOperationError(this.getNode(), "Set both 'Period Start' and 'Period End', or neither", {
				itemIndex: i,
			});
		}
		const qs = compact({
			q: periodStart === undefined ? filters.q : undefined,
			period_start: periodStart,
			period_end: periodEnd,
			zones: splitList(filters.zoneIds).join(',') || undefined,
		});
		const guests = ((await placeOsApiRequest.call(this, 'GET', `${STAFF}/guests`, { qs })) ?? []) as IDataObject[];
		const limit = listLimit.call(this, i);
		return limit === undefined ? guests : guests.slice(0, limit);
	},

	async get(i) {
		const guest = encodeURIComponent((this.getNodeParameter('guestId', i) as string).trim());
		return (await placeOsApiRequest.call(this, 'GET', `${STAFF}/guests/${guest}`)) as IDataObject;
	},

	async create(i) {
		const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const body = compact({
			email: (this.getNodeParameter('email', i) as string).trim(),
			name: fields.name,
			preferred_name: fields.preferredName,
			phone: fields.phone,
			organisation: fields.organisation,
			notes: fields.notes,
		});
		if (fields.banned !== undefined) body.banned = fields.banned;
		if (fields.dangerous !== undefined) body.dangerous = fields.dangerous;
		if (fields.extensionData !== undefined) {
			body.extension_data = jsonObject.call(this, fields.extensionData, 'Extension Data (JSON)', i);
		}
		return (await placeOsApiRequest.call(this, 'POST', `${STAFF}/guests`, { body })) as IDataObject;
	},

	async getBookings(i) {
		const guest = encodeURIComponent((this.getNodeParameter('guestId', i) as string).trim());
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const qs = compact({ include_past: options.includePast ? true : undefined, limit: options.limit });
		return ((await placeOsApiRequest.call(this, 'GET', `${STAFF}/guests/${guest}/bookings`, { qs })) ??
			[]) as IDataObject[];
	},
};

export const deskHandlers: Record<string, OperationHandler> = {
	async getFree(i) {
		const zone = (this.getNodeParameter('zone', i, '', { extractValue: true }) as string).trim();
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs = compact({
			zone_id: zone,
			features: splitList(filters.features).join(',') || undefined,
			period_start: epoch.call(this, filters.periodStart, 'Period Start', i),
			period_end: epoch.call(this, filters.periodEnd, 'Period End', i),
			q: filters.q,
		});
		return await placeOsRequestList.call(this, `${STAFF}/desks`, qs, listLimit.call(this, i), 100, (body) => {
			const page = (body ?? {}) as IDataObject;
			const desks = Array.isArray(page.desks) ? (page.desks as IDataObject[]) : [];
			return desks.map((desk) => ({
				...desk,
				period_start: page.period_start,
				period_end: page.period_end,
				timezone: page.timezone,
			}));
		});
	},
};

export const spaceHandlers: Record<string, OperationHandler> = {
	async getAll(i) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs = compact({
			zone_ids: splitList(filters.zoneIds).join(',') || undefined,
			features: splitList(filters.features).join(',') || undefined,
			capacity: filters.capacity ? filters.capacity : undefined,
			q: filters.q,
		});
		return await placeOsRequestList.call(this, `${STAFF}/spaces`, qs, listLimit.call(this, i), 100);
	},
};
