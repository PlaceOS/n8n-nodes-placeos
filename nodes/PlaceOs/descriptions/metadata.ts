import type { INodeProperties } from 'n8n-workflow';

import { showFor } from './common';

const R = 'metadata';

export const metadataOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update metadata',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a metadata entry permanently',
				action: 'Delete metadata',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve the metadata of a zone, system or user',
				action: 'Get metadata',
			},
		],
		default: 'get',
	},
];

export const metadataFields: INodeProperties[] = [
	{
		displayName: 'Parent ID',
		name: 'parentId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. zone-AbC123xYz',
		description: 'The ID of the zone, system or user the metadata belongs to',
		displayOptions: showFor(R, ['get', 'upsert', 'delete']),
	},
	{
		displayName: 'Name',
		name: 'metadataName',
		type: 'string',
		default: '',
		placeholder: 'e.g. settings',
		description: 'The metadata entry to read. Leave empty to read every entry of the parent.',
		displayOptions: showFor(R, ['get']),
	},
	{
		displayName: 'Name',
		name: 'metadataName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. settings',
		description: 'The name of the metadata entry',
		displayOptions: showFor(R, ['upsert', 'delete']),
	},
	{
		displayName: 'Details',
		name: 'details',
		type: 'json',
		required: true,
		default: '{}',
		description: 'The JSON content of the entry',
		displayOptions: showFor(R, ['upsert']),
	},
	{
		displayName: 'Merge',
		name: 'merge',
		type: 'boolean',
		default: false,
		description:
			'Whether to merge the details into the existing entry (JSON merge patch) instead of replacing them. In a merge, a null value removes that key.',
		displayOptions: showFor(R, ['upsert']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(R, ['upsert']),
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'A description of the entry',
			},
		],
	},
];
