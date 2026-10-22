import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { expandModuleTypes } from './helpers';
import type { PlaceOsContext } from './transport';
import { ENGINE, placeOsApiRequest, placeOsRequest } from './transport';

const PAGE = 50;

/** Returns a system's `sys-` id, resolving a room email through the systems route when given one. */
export async function resolveSystemId(
	this: PlaceOsContext,
	value: string,
	cache?: Map<string, string>,
): Promise<string> {
	const trimmed = (value ?? '').trim();
	if (!trimmed.includes('@')) return trimmed;
	const cached = cache?.get(trimmed);
	if (cached) return cached;
	const system = (await placeOsApiRequest.call(
		this,
		'GET',
		`${ENGINE}/systems/${encodeURIComponent(trimmed)}`,
	)) as IDataObject;
	const id = String(system.id);
	cache?.set(trimmed, id);
	return id;
}

function currentSystem(context: ILoadOptionsFunctions): string {
	const value = context.getCurrentNodeParameter('system', { extractValue: true });
	return typeof value === 'string' ? value : '';
}

async function searchList(
	context: ILoadOptionsFunctions,
	path: string,
	filter: string | undefined,
	paginationToken: string | undefined,
	qs: IDataObject = {},
): Promise<INodeListSearchResult> {
	const offset = paginationToken ? parseInt(paginationToken, 10) || 0 : 0;
	const query: IDataObject = { ...qs, limit: PAGE, offset };
	if (filter) query.q = filter;
	const response = await placeOsRequest.call(context, 'GET', path, { qs: query });
	const rows = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
	const total = Number(response.headers['x-total-count'] ?? NaN);
	const nextOffset = offset + rows.length;
	const more = Number.isFinite(total) ? nextOffset < total : rows.length === PAGE;
	return {
		results: rows.map((row) => ({
			name: `${String(row.display_name || row.name)} (${String(row.id)})`,
			value: String(row.id),
		})),
		paginationToken: more ? String(nextOffset) : undefined,
	};
}

export async function searchSystems(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	return await searchList(this, `${ENGINE}/systems`, filter, paginationToken);
}

export async function searchZones(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	return await searchList(this, `${ENGINE}/zones`, filter, paginationToken);
}

export async function getModuleSlugs(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const system = currentSystem(this);
	if (!system) return [];
	const id = await resolveSystemId.call(this, system);
	const types = (await placeOsApiRequest.call(this, 'GET', `${ENGINE}/systems/${id}/types`)) as IDataObject;
	return expandModuleTypes(types ?? {}).map((slug) => ({ name: slug, value: slug }));
}

export async function getFunctions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const system = currentSystem(this);
	const slug = this.getCurrentNodeParameter('moduleSlug');
	if (!system || typeof slug !== 'string' || slug === '') return [];
	const id = await resolveSystemId.call(this, system);
	const functions = (await placeOsApiRequest.call(
		this,
		'GET',
		`${ENGINE}/systems/${id}/functions/${encodeURIComponent(slug)}`,
	)) as IDataObject;
	return Object.keys(functions ?? {})
		.sort()
		.map((name) => {
			const details = (functions[name] ?? {}) as IDataObject;
			const order = Array.isArray(details.order) ? (details.order as string[]) : [];
			const params = (details.params ?? {}) as IDataObject;
			const described = order.map((arg) => {
				const schema = (params[arg] ?? {}) as IDataObject;
				const type = schema.title ?? schema.type ?? 'any';
				return `${arg}: ${String(type)}`;
			});
			return {
				name: `${name}(${order.join(', ')})`,
				value: name,
				description: described.length ? described.join('; ') : 'No arguments',
			};
		});
}
