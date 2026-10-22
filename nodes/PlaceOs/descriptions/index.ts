import type { INodeProperties } from 'n8n-workflow';

import { bookingFields, bookingOperations } from './booking';
import { deskFields, deskOperations } from './desk';
import { guestFields, guestOperations } from './guest';
import { metadataFields, metadataOperations } from './metadata';
import { moduleFields, moduleOperations } from './module';
import { signalFields, signalOperations } from './signal';
import { spaceFields, spaceOperations } from './space';
import { systemFields, systemOperations } from './system';
import { userFields, userOperations } from './user';
import { zoneFields, zoneOperations } from './zone';

export const resourceField: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Booking', value: 'booking', description: 'Desk, parking, locker and visitor bookings (Staff API)' },
		{ name: 'Desk', value: 'desk', description: 'Free desks on a level (Staff API)' },
		{ name: 'Guest', value: 'guest', description: 'Visitors (Staff API)' },
		{ name: 'Metadata', value: 'metadata', description: 'JSON settings stored on zones, systems and users' },
		{ name: 'Module', value: 'module', description: 'A device or service driver instance' },
		{ name: 'Signal', value: 'signal', description: 'Messages published to driver subscriptions' },
		{ name: 'Space', value: 'space', description: 'Bookable rooms (Staff API)' },
		{ name: 'System', value: 'system', description: 'A room or space and the modules in it' },
		{ name: 'User', value: 'user', description: 'PlaceOS users' },
		{ name: 'Zone', value: 'zone', description: 'Organisations, buildings, levels and areas' },
	],
	default: 'system',
};

export const resourceProperties: INodeProperties[] = [
	...bookingOperations,
	...bookingFields,
	...deskOperations,
	...deskFields,
	...guestOperations,
	...guestFields,
	...metadataOperations,
	...metadataFields,
	...moduleOperations,
	...moduleFields,
	...signalOperations,
	...signalFields,
	...spaceOperations,
	...spaceFields,
	...systemOperations,
	...systemFields,
	...userOperations,
	...userFields,
	...zoneOperations,
	...zoneFields,
];
