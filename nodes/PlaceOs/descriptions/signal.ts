import type { INodeProperties } from 'n8n-workflow';

import { showFor } from './common';

const R = 'signal';

export const signalOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [R] } },
		options: [
			{
				name: 'Send',
				value: 'send',
				description: 'Publish a message on a PlaceOS channel that drivers can subscribe to',
				action: 'Send a signal',
			},
		],
		default: 'send',
	},
];

export const signalFields: INodeProperties[] = [
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. my/custom/channel',
		description:
			"The channel path. PlaceOS publishes the message on 'placeos/' followed by this path, where driver subscriptions receive it.",
		displayOptions: showFor(R, ['send']),
	},
	{
		displayName: 'Payload',
		name: 'payload',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		placeholder: 'e.g. {"event":"door_opened"}',
		description: 'The message to publish. It is sent as JSON when it is valid JSON, otherwise as plain text.',
		displayOptions: showFor(R, ['send']),
	},
];
