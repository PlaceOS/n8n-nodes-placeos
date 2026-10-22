import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { compact, expandModuleTypes, parseStateHash, pick, splitList, splitSlug } from '../helpers';
import { resolveSystemId } from '../SearchMethods';
import { ENGINE, placeOsApiRequest, placeOsRequestList } from '../transport';
import type { FunctionDetails } from './arguments';
import { orderNamedArguments, parseArgumentsJson } from './arguments';
import type { OperationHandler, RunContext } from './types';

export const SYSTEM_SIMPLE_FIELDS = [
	'id',
	'name',
	'display_name',
	'email',
	'zones',
	'modules',
	'bookable',
	'capacity',
	'timezone',
	'updated_at',
];

async function systemId(this: IExecuteFunctions, i: number, context: RunContext): Promise<string> {
	const value = this.getNodeParameter('system', i, '', { extractValue: true }) as string;
	return await resolveSystemId.call(this, value, context.systemIds);
}

function slug(this: IExecuteFunctions, i: number): string {
	return encodeURIComponent((this.getNodeParameter('moduleSlug', i) as string).trim());
}

const getAll: OperationHandler = async function (i) {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
	const qs = compact({
		q: filters.q,
		zone_id: splitList(filters.zoneIds).join(',') || undefined,
		features: splitList(filters.features).join(',') || undefined,
		email: splitList(filters.email).join(',') || undefined,
		module_id: filters.moduleId,
		capacity: filters.capacity ? filters.capacity : undefined,
		bookable: filters.bookable,
	});
	const systems = await placeOsRequestList.call(this, `${ENGINE}/systems`, qs, limit);
	const simplify = this.getNodeParameter('simplify', i) as boolean;
	return simplify ? systems.map((system) => pick(system, SYSTEM_SIMPLE_FIELDS)) : systems;
};

const get: OperationHandler = async function (i) {
	const value = this.getNodeParameter('system', i, '', { extractValue: true }) as string;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const system = (await placeOsApiRequest.call(
		this,
		'GET',
		`${ENGINE}/systems/${encodeURIComponent(value.trim())}`,
		{ qs: options.complete ? { complete: true } : {} },
	)) as IDataObject;
	const simplify = this.getNodeParameter('simplify', i) as boolean;
	return simplify ? pick(system, SYSTEM_SIMPLE_FIELDS) : system;
};

const getModuleTypes: OperationHandler = async function (i, context) {
	const id = await systemId.call(this, i, context);
	const types = ((await placeOsApiRequest.call(this, 'GET', `${ENGINE}/systems/${id}/types`)) ?? {}) as IDataObject;
	return Object.keys(types)
		.sort()
		.map((name) => ({
			system_id: id,
			name,
			count: types[name],
			slugs: expandModuleTypes({ [name]: types[name] }),
		}));
};

const getFunctions: OperationHandler = async function (i, context) {
	const id = await systemId.call(this, i, context);
	const moduleSlug = slug.call(this, i);
	const functions = ((await placeOsApiRequest.call(
		this,
		'GET',
		`${ENGINE}/systems/${id}/functions/${moduleSlug}`,
	)) ?? {}) as IDataObject;
	return Object.keys(functions)
		.sort()
		.map((name) => {
			const details = (functions[name] ?? {}) as IDataObject;
			return {
				system_id: id,
				module: decodeURIComponent(moduleSlug),
				name,
				arity: details.arity,
				order: details.order,
				params: details.params,
			};
		});
};

const execute: OperationHandler = async function (i, context) {
	const id = await systemId.call(this, i, context);
	const moduleSlug = slug.call(this, i);
	const functionName = (this.getNodeParameter('functionName', i) as string).trim();
	const mode = this.getNodeParameter('argumentMode', i) as string;
	let args: unknown[];
	if (mode === 'positional') {
		args = parseArgumentsJson.call(this, this.getNodeParameter('argumentsJson', i), i);
	} else {
		const named = (this.getNodeParameter('arguments.argument', i, []) ?? []) as Array<{ name: string; value: string }>;
		const functions = (await placeOsApiRequest.call(
			this,
			'GET',
			`${ENGINE}/systems/${id}/functions/${moduleSlug}`,
		)) as IDataObject;
		const details = (functions?.[functionName] ?? undefined) as FunctionDetails | undefined;
		args = details
			? orderNamedArguments.call(this, functionName, details, named, i)
			: named.map(({ value }) => value);
	}
	const result = await placeOsApiRequest.call(
		this,
		'POST',
		`${ENGINE}/systems/${id}/${moduleSlug}/${encodeURIComponent(functionName)}`,
		{ body: args },
	);
	const { mod, index } = splitSlug(decodeURIComponent(moduleSlug));
	return { system_id: id, module: mod, index, function: functionName, arguments: args, result } as IDataObject;
};

const getState: OperationHandler = async function (i, context) {
	const id = await systemId.call(this, i, context);
	const moduleSlug = slug.call(this, i);
	const key = (this.getNodeParameter('statusKey', i, '') as string).trim();
	if (key !== '') {
		const value = await placeOsApiRequest.call(
			this,
			'GET',
			`${ENGINE}/systems/${id}/${moduleSlug}/${encodeURIComponent(key)}`,
		);
		return { system_id: id, module: decodeURIComponent(moduleSlug), key, value } as IDataObject;
	}
	const state = await placeOsApiRequest.call(this, 'GET', `${ENGINE}/systems/${id}/${moduleSlug}`);
	return parseStateHash(state);
};

function runState(running: boolean): OperationHandler {
	return async function (i, context) {
		const id = await systemId.call(this, i, context);
		await placeOsApiRequest.call(this, 'POST', `${ENGINE}/systems/${id}/${running ? 'start' : 'stop'}`);
		return { system_id: id, success: true };
	};
}

export const systemHandlers: Record<string, OperationHandler> = {
	getAll,
	get,
	getModuleTypes,
	getFunctions,
	execute,
	getState,
	start: runState(true),
	stop: runState(false),
};
