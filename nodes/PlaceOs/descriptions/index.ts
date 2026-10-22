import type { INodeProperties } from 'n8n-workflow';

import { systemFields, systemOperations } from './system';

export const resourceField: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [{ name: 'System', value: 'system' }],
	default: 'system',
};

export const resourceProperties: INodeProperties[] = [...systemOperations, ...systemFields];
