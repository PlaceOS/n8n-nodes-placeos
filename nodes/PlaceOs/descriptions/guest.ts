import type { INodeProperties } from 'n8n-workflow';

import { returnAllAndLimit, showFor } from './common';

const R = 'guest';

export const guestOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{ name: 'Create', value: 'create', description: 'Create a new guest', action: 'Create a guest' },
			{ name: 'Get', value: 'get', description: 'Retrieve a guest', action: 'Get a guest' },
			{
				name: 'Get Bookings',
				value: 'getBookings',
				description: "Retrieve a guest's bookings",
				action: 'Get the bookings of a guest',
			},
			{ name: 'Get Many', value: 'getAll', description: 'Retrieve a list of guests', action: 'Get many guests' },
		],
		default: 'getAll',
	},
];

export const guestFields: INodeProperties[] = [
	{
		displayName: 'Guest ID or Email',
		name: 'guestId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. sam@example.com',
		displayOptions: showFor(R, ['get', 'getBookings']),
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'e.g. sam@example.com',
		required: true,
		default: '',
		displayOptions: showFor(R, ['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(R, ['create']),
		options: [
			{
				displayName: 'Banned',
				name: 'banned',
				type: 'boolean',
				default: false,
				description: 'Whether the guest is banned from visiting',
			},
			{
				displayName: 'Dangerous',
				name: 'dangerous',
				type: 'boolean',
				default: false,
				description: 'Whether the guest is flagged as dangerous',
			},
			{
				displayName: 'Extension Data (JSON)',
				name: 'extensionData',
				type: 'json',
				default: '{}',
			},
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			{ displayName: 'Notes', name: 'notes', type: 'string', default: '' },
			{ displayName: 'Organisation', name: 'organisation', type: 'string', default: '' },
			{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
			{ displayName: 'Preferred Name', name: 'preferredName', type: 'string', default: '' },
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(R, ['getBookings']),
		options: [
			{
				displayName: 'Include Past',
				name: 'includePast',
				type: 'boolean',
				default: false,
				description: 'Whether to include bookings that have ended',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
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
				displayName: 'Period End',
				name: 'periodEnd',
				type: 'dateTime',
				default: '',
				description: 'With Period Start, return the guests expected in this period',
			},
			{
				displayName: 'Period Start',
				name: 'periodStart',
				type: 'dateTime',
				default: '',
				description: 'With Period End, return the guests expected in this period',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in names, emails and organisations. Ignored when a period is given.',
			},
			{
				displayName: 'Zone IDs',
				name: 'zoneIds',
				type: 'string',
				default: '',
				description: 'With a period, return only guests of bookings in these zones, comma-separated',
			},
		],
	},
];
