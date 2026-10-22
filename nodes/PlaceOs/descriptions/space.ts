import type { INodeProperties } from 'n8n-workflow';

import { returnAllAndLimit, showFor } from './common';

const R = 'space';

export const spaceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of bookable spaces',
				action: 'Get many spaces',
			},
		],
		default: 'getAll',
	},
];

export const spaceFields: INodeProperties[] = [
	{
		displayName: 'Space search needs PlaceOS 2.2610.1 or later',
		name: 'spaceNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor(R, ['getAll']),
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
				displayName: 'Features',
				name: 'features',
				type: 'string',
				default: '',
				placeholder: 'e.g. vidconf,whiteboard',
				description: 'Return only spaces that have every one of these features, comma-separated',
			},
			{
				displayName: 'Minimum Capacity',
				name: 'capacity',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in space names',
			},
			{
				displayName: 'Zone IDs',
				name: 'zoneIds',
				type: 'string',
				default: '',
				placeholder: 'e.g. zone-building,zone-level',
				description: 'Return only spaces that are in every one of these zones, comma-separated',
			},
		],
	},
];
