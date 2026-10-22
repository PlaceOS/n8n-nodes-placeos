import { systemHandlers } from './system';
import type { OperationHandler } from './types';

export const handlers: Record<string, Record<string, OperationHandler>> = {
	system: systemHandlers,
};
