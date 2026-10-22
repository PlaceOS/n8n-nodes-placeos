import type { INodeProperties } from 'n8n-workflow';

import { returnAllAndLimit, showFor } from './common';

const R = 'user';

export const userOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{ name: 'Get', value: 'get', description: 'Retrieve a user', action: 'Get a user' },
			{
				name: 'Get Current',
				value: 'getCurrent',
				description: 'Retrieve the user the API key acts as',
				action: 'Get the current user',
			},
			{ name: 'Get Many', value: 'getAll', description: 'Retrieve a list of users', action: 'Get many users' },
		],
		default: 'get',
	},
];

export const userFields: INodeProperties[] = [
	{
		displayName: 'User ID or Email',
		name: 'userId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. user-AbC123xYz or jane@example.com',
		description: "The user's ID, email address, login name or staff ID",
		displayOptions: showFor(R, ['get']),
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
				displayName: 'Include Deleted',
				name: 'includeDeleted',
				type: 'boolean',
				default: false,
				description: 'Whether to include deleted users',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search for in names and email addresses',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(R, ['get', 'getAll']),
		options: [
			{
				displayName: 'Include Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: false,
				description: "Whether to include the user's metadata entries",
			},
		],
	},
];
