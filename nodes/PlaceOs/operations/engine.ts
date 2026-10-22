import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { compact, parseLooseJson, parseStateHash, splitList } from '../helpers';
import { ENGINE, placeOsApiRequest, placeOsRequestList } from '../transport';
import { parseArgumentsJson } from './arguments';
import type { OperationHandler } from './types';

function moduleId(this: IExecuteFunctions, i: number): string {
	return encodeURIComponent((this.getNodeParameter('moduleId', i) as string).trim());
}

function listLimit(this: IExecuteFunctions, i: number): number | undefined {
	return (this.getNodeParameter('returnAll', i) as boolean) ? undefined : (this.getNodeParameter('limit', i) as number);
}

export function jsonObject(this: IExecuteFunctions, value: unknown, label: string, i: number): IDataObject {
	const parsed = typeof value === 'string' ? parseLooseJson(value === '' ? '{}' : value) : value;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `'${label}' must be a JSON object, such as {"key": "value"}`, {
			itemIndex: i,
		});
	}
	return parsed as IDataObject;
}

export const moduleHandlers: Record<string, OperationHandler> = {
	async get(i) {
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		return (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/modules/${moduleId.call(this, i)}`, {
			qs: options.complete ? { complete: true } : {},
		})) as IDataObject;
	},

	async getState(i) {
		const id = moduleId.call(this, i);
		const key = (this.getNodeParameter('statusKey', i, '') as string).trim();
		if (key !== '') {
			// this route returns the stored JSON as a JSON string, so it is parsed twice
			const raw = await placeOsApiRequest.call(this, 'GET', `${ENGINE}/modules/${id}/state/${encodeURIComponent(key)}`);
			return { module_id: decodeURIComponent(id), key, value: parseLooseJson(raw) } as IDataObject;
		}
		return parseStateHash(await placeOsApiRequest.call(this, 'GET', `${ENGINE}/modules/${id}/state`));
	},

	async execute(i) {
		const id = moduleId.call(this, i);
		const functionName = (this.getNodeParameter('moduleFunctionName', i) as string).trim();
		const args = parseArgumentsJson.call(this, this.getNodeParameter('argumentsJson', i), i);
		const result = await placeOsApiRequest.call(
			this,
			'POST',
			`${ENGINE}/modules/${id}/exec/${encodeURIComponent(functionName)}`,
			{ body: args },
		);
		return { module_id: decodeURIComponent(id), function: functionName, arguments: args, result } as IDataObject;
	},

	async start(i) {
		const id = moduleId.call(this, i);
		await placeOsApiRequest.call(this, 'POST', `${ENGINE}/modules/${id}/start`);
		return { module_id: decodeURIComponent(id), success: true };
	},

	async stop(i) {
		const id = moduleId.call(this, i);
		await placeOsApiRequest.call(this, 'POST', `${ENGINE}/modules/${id}/stop`);
		return { module_id: decodeURIComponent(id), success: true };
	},
};

export const zoneHandlers: Record<string, OperationHandler> = {
	async get(i) {
		const zone = this.getNodeParameter('zone', i, '', { extractValue: true }) as string;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		return (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/zones/${encodeURIComponent(zone.trim())}`, {
			qs: options.complete ? { complete: true } : {},
		})) as IDataObject;
	},

	async getAll(i) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const qs = compact({
			q: filters.q,
			parent_id: splitList(filters.parentId).join(',') || undefined,
			tags: splitList(filters.tags).join(',') || undefined,
			include_children_count: filters.includeChildrenCount ? true : undefined,
		});
		return await placeOsRequestList.call(this, `${ENGINE}/zones`, qs, listLimit.call(this, i));
	},

	async getTags() {
		const tags = (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/zones/tags`)) as unknown;
		const unique = new Set(
			(Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter((tag) => tag !== ''),
		);
		return [...unique].sort().map((tag) => ({ tag }));
	},
};

export const metadataHandlers: Record<string, OperationHandler> = {
	async get(i) {
		const parentId = encodeURIComponent((this.getNodeParameter('parentId', i) as string).trim());
		const name = (this.getNodeParameter('metadataName', i, '') as string).trim();
		const entries = ((await placeOsApiRequest.call(this, 'GET', `${ENGINE}/metadata/${parentId}`, {
			qs: name ? { name } : {},
		})) ?? {}) as IDataObject;
		return Object.values(entries) as IDataObject[];
	},

	async upsert(i) {
		const parentId = (this.getNodeParameter('parentId', i) as string).trim();
		const name = (this.getNodeParameter('metadataName', i) as string).trim();
		if (name === '') {
			throw new NodeOperationError(this.getNode(), "'Name' must not be empty", { itemIndex: i });
		}
		const details = jsonObject.call(this, this.getNodeParameter('details', i), 'Details', i);
		const merge = this.getNodeParameter('merge', i, false) as boolean;
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		let description = additional.description as string | undefined;
		if (description === undefined) {
			// PlaceOS requires a description on every write; keep the existing one
			const existing = ((await placeOsApiRequest.call(this, 'GET', `${ENGINE}/metadata/${encodeURIComponent(parentId)}`, {
				qs: { name },
			})) ?? {}) as IDataObject;
			description = ((existing[name] as IDataObject | undefined)?.description as string | undefined) ?? '';
		}
		const body: IDataObject = { name, parent_id: parentId, description, details };
		return (await placeOsApiRequest.call(
			this,
			merge ? 'PATCH' : 'PUT',
			`${ENGINE}/metadata/${encodeURIComponent(parentId)}`,
			{ body },
		)) as IDataObject;
	},

	async delete(i) {
		const parentId = (this.getNodeParameter('parentId', i) as string).trim();
		const name = (this.getNodeParameter('metadataName', i) as string).trim();
		if (name === '') {
			throw new NodeOperationError(
				this.getNode(),
				"'Name' must not be empty: PlaceOS deletes every metadata entry of the parent when no name is given",
				{ itemIndex: i },
			);
		}
		await placeOsApiRequest.call(this, 'DELETE', `${ENGINE}/metadata/${encodeURIComponent(parentId)}`, {
			qs: { name },
		});
		return { deleted: true };
	},
};

export const userHandlers: Record<string, OperationHandler> = {
	async getCurrent() {
		return (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/users/current`)) as IDataObject;
	},

	async get(i) {
		const user = (this.getNodeParameter('userId', i) as string).trim();
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		return (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/users/${encodeURIComponent(user)}`, {
			qs: options.includeMetadata ? { include_metadata: true } : {},
		})) as IDataObject;
	},

	async getAll(i) {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const qs = compact({
			q: filters.q,
			include_deleted: filters.includeDeleted ? true : undefined,
			include_metadata: options.includeMetadata ? true : undefined,
		});
		return await placeOsRequestList.call(this, `${ENGINE}/users`, qs, listLimit.call(this, i));
	},
};

export const signalHandlers: Record<string, OperationHandler> = {
	async send(i) {
		const channel = (this.getNodeParameter('channel', i) as string).trim().replace(/^\/+/, '');
		if (channel === '') {
			throw new NodeOperationError(this.getNode(), "'Channel' must not be empty", { itemIndex: i });
		}
		const payload = this.getNodeParameter('payload', i, '') as string;
		const parsed = parseLooseJson(payload);
		const isJson = typeof payload === 'string' && payload.trim() !== '' && parsed !== payload;
		await placeOsApiRequest.call(this, 'POST', `${ENGINE}/signal`, {
			qs: { channel },
			rawBody: { data: payload, contentType: isJson ? 'application/json' : 'text/plain' },
		});
		return { channel, success: true };
	},
};
