import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { parseLooseJson } from '../helpers';

export interface FunctionDetails {
	arity?: number;
	order?: string[];
	params?: IDataObject;
}

export function parseArgumentsJson(this: IExecuteFunctions, value: unknown, itemIndex: number): unknown[] {
	const parsed = typeof value === 'string' ? parseLooseJson(value === '' ? '[]' : value) : value;
	if (!Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), "'Arguments (JSON)' must be a JSON array, such as [true] or []", {
			itemIndex,
		});
	}
	return parsed;
}

/**
 * Puts named arguments into the positional order the function expects.
 * Missing arguments before the last given one take their schema default, or null when optional.
 * Throws for unknown names and for required arguments that were left out.
 */
export function orderNamedArguments(
	this: IExecuteFunctions,
	functionName: string,
	details: FunctionDetails,
	named: Array<{ name: string; value: string }>,
	itemIndex: number,
): unknown[] {
	const order = details.order ?? [];
	const params = details.params ?? {};
	const given = new Map<string, unknown>();
	for (const { name, value } of named) {
		const key = (name ?? '').trim();
		if (key === '') continue;
		if (!order.includes(key)) {
			throw new NodeOperationError(
				this.getNode(),
				`'${functionName}' has no argument named '${key}'`,
				{ itemIndex, description: order.length ? `Its arguments are: ${order.join(', ')}` : 'It takes no arguments' },
			);
		}
		given.set(key, parseLooseJson(value));
	}

	let last = -1;
	order.forEach((arg, position) => {
		if (given.has(arg)) last = position;
	});

	const args: unknown[] = [];
	for (let position = 0; position < order.length; position++) {
		const arg = order[position];
		if (given.has(arg)) {
			args.push(given.get(arg));
			continue;
		}
		const schema = (params[arg] ?? {}) as IDataObject;
		const hasDefault = Object.prototype.hasOwnProperty.call(schema, 'default');
		if (position > last) {
			if (hasDefault) continue;
			throw new NodeOperationError(this.getNode(), `'${functionName}' needs the argument '${arg}'`, { itemIndex });
		}
		if (hasDefault) {
			args.push(schema.default);
			continue;
		}
		throw new NodeOperationError(this.getNode(), `'${functionName}' needs the argument '${arg}'`, { itemIndex });
	}
	return args;
}
