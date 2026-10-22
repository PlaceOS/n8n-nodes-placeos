import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

export interface RunContext {
	/** Room email to system id, filled by resolveSystemId during one execution. */
	systemIds: Map<string, string>;
}

export type OperationResult = IDataObject | IDataObject[];

export type OperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
	context: RunContext,
) => Promise<OperationResult>;
