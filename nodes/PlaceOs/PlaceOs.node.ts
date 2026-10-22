import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { resourceField, resourceProperties } from './descriptions';
import { handlers } from './operations';
import type { RunContext } from './operations/types';
import { getFunctions, getModuleSlugs, searchSystems, searchZones } from './SearchMethods';

export class PlaceOs implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlaceOS',
		name: 'placeOs',
		icon: { light: 'file:placeos.svg', dark: 'file:placeos.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read and control a PlaceOS deployment: systems, modules, zones, metadata, users, bookings, visitors and spaces',
		defaults: { name: 'PlaceOS' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'placeOsApi', required: true }],
		properties: [resourceField, ...resourceProperties],
	};

	methods = {
		listSearch: { searchSystems, searchZones },
		loadOptions: { getModuleSlugs, getFunctions },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const context: RunContext = { systemIds: new Map() };

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const handler = handlers[resource]?.[operation];
				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation '${operation}' is not supported for '${resource}'`,
						{ itemIndex: i },
					);
				}
				const result = await handler.call(this, i, context);
				const rows: IDataObject[] = Array.isArray(result) ? result : [result];
				for (const row of rows) {
					returnData.push({ json: row, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					if (error.context.itemIndex === undefined) error.context.itemIndex = i;
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
