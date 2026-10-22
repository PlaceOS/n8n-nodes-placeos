import type { INodeProperties } from 'n8n-workflow';

import { argumentFields, showFor } from './common';

const R = 'module';

export const moduleOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{
				name: 'Execute Function',
				value: 'execute',
				description: 'Run a function on a module',
				action: 'Execute a module function',
			},
			{ name: 'Get', value: 'get', description: 'Retrieve a module', action: 'Get a module' },
			{
				name: 'Get State',
				value: 'getState',
				description: "Retrieve a module's status values",
				action: 'Get the state of a module',
			},
			{ name: 'Start', value: 'start', description: 'Start a module', action: 'Start a module' },
			{ name: 'Stop', value: 'stop', description: 'Stop a module', action: 'Stop a module' },
		],
		default: 'get',
	},
];

export const moduleFields: INodeProperties[] = [
	{
		displayName: 'Module ID',
		name: 'moduleId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. mod-AbC123xYz',
		description: "The module's ID, as shown in Backoffice",
		displayOptions: showFor(R, ['get', 'getState', 'execute', 'start', 'stop']),
	},
	{
		displayName: 'Function Name',
		name: 'moduleFunctionName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. power',
		description: 'The function to run',
		displayOptions: showFor(R, ['execute']),
	},
	...argumentFields(R, ['execute'], false),
	{
		displayName: 'Status Key',
		name: 'statusKey',
		type: 'string',
		default: '',
		placeholder: 'e.g. power',
		description: 'The status value to read. Leave empty to read every status value of the module.',
		displayOptions: showFor(R, ['getState']),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(R, ['get']),
		options: [
			{
				displayName: 'Include Driver and System',
				name: 'complete',
				type: 'boolean',
				default: false,
				description: "Whether to include the module's driver and system details",
			},
		],
	},
];
