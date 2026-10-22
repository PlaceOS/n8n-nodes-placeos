import type { INodeProperties } from 'n8n-workflow';

import {
	argumentFields,
	moduleSlugField,
	returnAllAndLimit,
	showFor,
	simplifyField,
	systemLocator,
} from './common';

const R = 'system';

export const systemOperations: INodeProperties[] = [
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
				description: "Run a function on one of the system's modules",
				action: 'Execute a module function in a system',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a system',
				action: 'Get a system',
			},
			{
				name: 'Get Functions',
				value: 'getFunctions',
				description: 'Retrieve the functions a module offers and their arguments',
				action: 'Get the functions of a module in a system',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of systems',
				action: 'Get many systems',
			},
			{
				name: 'Get Module Types',
				value: 'getModuleTypes',
				description: 'Retrieve the modules in a system by class name and index',
				action: 'Get the module types in a system',
			},
			{
				name: 'Get State',
				value: 'getState',
				description: "Retrieve a module's status values",
				action: 'Get the state of a module in a system',
			},
			{
				name: 'Start',
				value: 'start',
				description: "Start the system's modules",
				action: 'Start a system',
			},
			{
				name: 'Stop',
				value: 'stop',
				description: "Stop the system's modules",
				action: 'Stop a system',
			},
		],
		default: 'getAll',
	},
];

export const systemFields: INodeProperties[] = [
	systemLocator(R, ['get', 'getModuleTypes', 'getFunctions', 'execute', 'getState', 'start', 'stop']),
	moduleSlugField(R, ['getFunctions', 'execute', 'getState']),
	{
		displayName: 'Function Name or ID',
		name: 'functionName',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getFunctions',
			loadOptionsDependsOn: ['system.value', 'moduleSlug'],
		},
		required: true,
		default: '',
		description:
			'The function to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: showFor(R, ['execute']),
	},
	...argumentFields(R, ['execute'], true),
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
				displayName: 'Include Zones and Modules',
				name: 'complete',
				type: 'boolean',
				default: false,
				description: "Whether to include the system's zone and module records",
			},
		],
	},
	...returnAllAndLimit(R, ['getAll']),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor(R, ['getAll']),
		options: [
			{
				displayName: 'Bookable',
				name: 'bookable',
				type: 'boolean',
				default: true,
				description: 'Whether to return only bookable systems (on) or only non-bookable systems (off)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'e.g. boardroom@example.com',
				description: 'Return only systems with one of these resource emails, comma-separated',
			},
			{
				displayName: 'Features',
				name: 'features',
				type: 'string',
				default: '',
				placeholder: 'e.g. vidconf,whiteboard',
				description: 'Return only systems that have every one of these features, comma-separated',
			},
			{
				displayName: 'Minimum Capacity',
				name: 'capacity',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Return only systems with at least this capacity',
			},
			{
				displayName: 'Module ID',
				name: 'moduleId',
				type: 'string',
				default: '',
				placeholder: 'e.g. mod-AbC123xYz',
				description: 'Return only systems that contain this module',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in system names and descriptions',
			},
			{
				displayName: 'Zone IDs',
				name: 'zoneIds',
				type: 'string',
				default: '',
				placeholder: 'e.g. zone-AbC123xYz,zone-DeF456uVw',
				description: 'Return only systems that are in every one of these zones, comma-separated',
			},
		],
	},
	simplifyField(R, ['getAll', 'get']),
];
