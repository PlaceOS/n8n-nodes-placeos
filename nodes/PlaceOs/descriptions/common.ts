import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

export function showFor(resource: string, operations: string[]): IDisplayOptions {
	return { show: { resource: [resource], operation: operations } };
}

export function systemLocator(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'System',
		name: 'system',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The PlaceOS system (room or space)',
		displayOptions: showFor(resource, operations),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchSystems', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. sys-AbC123xYz',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^sys-.+', errorMessage: 'System IDs start with sys-' },
					},
				],
			},
			{
				displayName: 'Room Email',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. boardroom@example.com',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^[^@\\s]+@[^@\\s]+$', errorMessage: 'Not a valid email address' },
					},
				],
			},
		],
	};
}

export function zoneLocator(resource: string, operations: string[], description = 'The PlaceOS zone'): INodeProperties {
	return {
		displayName: 'Zone',
		name: 'zone',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		displayOptions: showFor(resource, operations),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchZones', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. zone-AbC123xYz',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^zone-.+', errorMessage: 'Zone IDs start with zone-' },
					},
				],
			},
		],
	};
}

export function moduleSlugField(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'Module Name or ID',
		name: 'moduleSlug',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getModuleSlugs', loadOptionsDependsOn: ['system.value'] },
		required: true,
		default: '',
		description:
			'The module in the system, as its class name and index, such as Display_1. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor(resource, operations),
	};
}

export function returnAllAndLimit(resource: string, operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: showFor(resource, operations),
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { resource: [resource], operation: operations, returnAll: [false] } },
		},
	];
}

export function simplifyField(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: showFor(resource, operations),
	};
}

export function argumentFields(resource: string, operations: string[], allowNamed: boolean): INodeProperties[] {
	const fields: INodeProperties[] = [];
	if (allowNamed) {
		fields.push({
			displayName: 'Argument Mode',
			name: 'argumentMode',
			type: 'options',
			noDataExpression: true,
			default: 'named',
			options: [
				{
					name: 'Named',
					value: 'named',
					description: "Give each argument by name; they are put in the function's order",
				},
				{
					name: 'Positional JSON',
					value: 'positional',
					description: 'Give all arguments as one JSON array, in order',
				},
			],
			displayOptions: showFor(resource, operations),
		});
		fields.push({
			displayName: 'Arguments',
			name: 'arguments',
			type: 'fixedCollection',
			placeholder: 'Add Argument',
			typeOptions: { multipleValues: true },
			default: {},
			displayOptions: { show: { resource: [resource], operation: operations, argumentMode: ['named'] } },
			options: [
				{
					displayName: 'Argument',
					name: 'argument',
					values: [
						{
							displayName: 'Name',
							name: 'name',
							type: 'string',
							default: '',
							placeholder: 'e.g. state',
							description: "The argument's name, as listed for the function",
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'string',
							default: '',
							placeholder: 'e.g. true',
							description:
								'A JSON value, such as true, 3, "hdmi" or {"a":1}. Text that is not valid JSON is sent as a string.',
						},
					],
				},
			],
		});
	}
	fields.push({
		displayName: 'Arguments (JSON)',
		name: 'argumentsJson',
		type: 'json',
		required: true,
		default: '[]',
		description: 'The arguments as a JSON array, in the order the function takes them',
		displayOptions: allowNamed
			? { show: { resource: [resource], operation: operations, argumentMode: ['positional'] } }
			: showFor(resource, operations),
	});
	return fields;
}
