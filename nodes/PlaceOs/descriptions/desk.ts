import type { INodeProperties } from 'n8n-workflow';

import { returnAllAndLimit, showFor, zoneLocator } from './common';

const R = 'desk';

export const deskOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{
				name: 'Get Free Desks',
				value: 'getFree',
				description: 'Retrieve the desks on a level that are free for a period',
				action: 'Get free desks',
			},
		],
		default: 'getFree',
	},
];

export const deskFields: INodeProperties[] = [
	{
		displayName: 'Desk search needs PlaceOS 2.2610.1 or later',
		name: 'deskNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor(R, ['getFree']),
	},
	zoneLocator(R, ['getFree'], 'The level to search'),
	...returnAllAndLimit(R, ['getFree']),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor(R, ['getFree']),
		options: [
			{
				displayName: 'Features',
				name: 'features',
				type: 'string',
				default: '',
				placeholder: 'e.g. standing,dual-monitor',
				description: 'Return only desks that have every one of these features, comma-separated',
			},
			{
				displayName: 'Period End',
				name: 'periodEnd',
				type: 'dateTime',
				default: '',
				description: 'Defaults to the end of the start day',
			},
			{
				displayName: 'Period Start',
				name: 'periodStart',
				type: 'dateTime',
				default: '',
				description: 'Defaults to now',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in desk names',
			},
		],
	},
];
