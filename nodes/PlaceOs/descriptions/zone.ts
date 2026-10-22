import type { INodeProperties } from 'n8n-workflow';

import { returnAllAndLimit, showFor, zoneLocator } from './common';

const R = 'zone';

export const zoneOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{ name: 'Get', value: 'get', description: 'Retrieve a zone', action: 'Get a zone' },
			{ name: 'Get Many', value: 'getAll', description: 'Retrieve a list of zones', action: 'Get many zones' },
			{
				name: 'Get Tags',
				value: 'getTags',
				description: 'Retrieve every tag used on zones',
				action: 'Get zone tags',
			},
		],
		default: 'getAll',
	},
];

export const zoneFields: INodeProperties[] = [
	zoneLocator(R, ['get']),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(R, ['get']),
		options: [
			{
				displayName: 'Include Triggers',
				name: 'complete',
				type: 'boolean',
				default: false,
				description: "Whether to include the zone's trigger records",
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
		description:
			'An API key without the Support permission must filter by parent or tags, otherwise PlaceOS only returns zones it has been granted',
		options: [
			{
				displayName: 'Include Children Count',
				name: 'includeChildrenCount',
				type: 'boolean',
				default: false,
				description: 'Whether to add the number of child zones to each zone',
			},
			{
				displayName: 'Parent Zone IDs',
				name: 'parentId',
				type: 'string',
				default: '',
				placeholder: 'e.g. zone-AbC123xYz',
				description:
					"Return only children of these zones, comma-separated. Use 'root' for zones without a parent.",
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in zone names and descriptions',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. building',
				description: 'Return only zones that have every one of these tags, comma-separated, such as building or level',
			},
		],
	},
];
