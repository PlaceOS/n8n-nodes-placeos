import { metadataHandlers, moduleHandlers, signalHandlers, userHandlers, zoneHandlers } from './engine';
import { bookingHandlers, deskHandlers, guestHandlers, spaceHandlers } from './staff';
import { systemHandlers } from './system';
import type { OperationHandler } from './types';

export const handlers: Record<string, Record<string, OperationHandler>> = {
	booking: bookingHandlers,
	desk: deskHandlers,
	guest: guestHandlers,
	metadata: metadataHandlers,
	module: moduleHandlers,
	signal: signalHandlers,
	space: spaceHandlers,
	system: systemHandlers,
	user: userHandlers,
	zone: zoneHandlers,
};
