import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { systemLocator } from '../PlaceOs/descriptions/common';
import { expandModuleTypes, moduleSlug, splitSlug } from '../PlaceOs/helpers';
import { getModuleSlugs, resolveSystemId, searchSystems } from '../PlaceOs/SearchMethods';
import { ENGINE, getPlaceOsCredentials, placeOsApiRequest } from '../PlaceOs/transport';
import type { Binding, NotifyInfo } from './ControlSocket';
import { bindingKey, ControlSocket, controlSocketUrl } from './ControlSocket';

interface BindingRow {
	moduleSlug?: string;
	statusKey?: string;
}

interface TriggerOptions {
	emitInitialValue?: boolean;
	onlyOnChange?: boolean;
	pingInterval?: number;
	reconnectAttempts?: number;
}

const systemField = systemLocator('', []);
delete systemField.displayOptions;

export class PlaceOsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlaceOS Trigger',
		name: 'placeOsTrigger',
		icon: { light: 'file:placeos.svg', dark: 'file:placeos.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: 'Status value changed',
		description: 'Starts the workflow when a PlaceOS module status value changes',
		defaults: { name: 'PlaceOS Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'placeOsApi', required: true }],
		triggerPanel: {
			header: '',
			executionsHelp: {
				inactive:
					"While building your workflow, click the 'Execute step' button, then change one of the status values. The first value PlaceOS sends, usually the current one, ends the test and appears in the editor.<br /><br />Once you're happy with your workflow, publish it. Then every time a status value changes, the workflow will execute. These executions will show up in the executions list, but not in the editor.",
				active:
					"While building your workflow, click the 'Execute step' button, then change one of the status values. The first value PlaceOS sends, usually the current one, ends the test and appears in the editor.<br /><br />Your workflow will also execute automatically, since it's published. Every time a status value changes, this node will trigger an execution. These executions will show up in the executions list, but not in the editor.",
			},
			activationHint:
				"Once you've finished building your workflow, publish it to have it also listen continuously (you just won't see those executions here).",
		},
		properties: [
			systemField,
			{
				displayName: 'Status Values',
				name: 'bindings',
				type: 'fixedCollection',
				placeholder: 'Add Status Value',
				typeOptions: { multipleValues: true },
				default: {},
				required: true,
				description: 'The module status values to watch. A change to any of them starts the workflow.',
				options: [
					{
						displayName: 'Status Value',
						name: 'binding',
						values: [
							{
								displayName: 'Module Name or ID',
								name: 'moduleSlug',
								type: 'options',
								typeOptions: { loadOptionsMethod: 'getModuleSlugs', loadOptionsDependsOn: ['system.value'] },
								default: '',
								description:
									'The module, as its class name and index, such as Display_1. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Status Key',
								name: 'statusKey',
								type: 'string',
								default: '',
								placeholder: 'e.g. power',
								description: "The name of the module's status value",
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Emit Current Value on Start',
						name: 'emitInitialValue',
						type: 'boolean',
						default: false,
						description:
							'Whether to start the workflow with the current value of each status when the trigger starts, not only on changes',
					},
					{
						displayName: 'Only on Change',
						name: 'onlyOnChange',
						type: 'boolean',
						default: true,
						description: 'Whether to skip updates whose value is the same as the last value received',
					},
					{
						displayName: 'Ping Interval (Seconds)',
						name: 'pingInterval',
						type: 'number',
						typeOptions: { minValue: 5 },
						default: 15,
						description:
							'How often to check that the connection is alive. It reconnects when two pings in a row get no answer.',
					},
					{
						displayName: 'Reconnect Attempts',
						name: 'reconnectAttempts',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 10,
						description:
							'How many times to try to reconnect after the connection drops before handing over to n8n, which then deactivates and retries the workflow',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchSystems },
		loadOptions: { getModuleSlugs },
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credentials = await getPlaceOsCredentials.call(this);
		const options = this.getNodeParameter('options', {}) as TriggerOptions;
		const rows = (this.getNodeParameter('bindings.binding', []) ?? []) as BindingRow[];
		const systemValue = this.getNodeParameter('system', '', { extractValue: true }) as string;
		if (!systemValue) throw new NodeOperationError(this.getNode(), "Choose a system in 'System'");
		if (rows.length === 0) {
			throw new NodeOperationError(this.getNode(), "Add at least one entry under 'Status Values'");
		}

		const sys = await resolveSystemId.call(this, systemValue);
		const types = ((await placeOsApiRequest.call(this, 'GET', `${ENGINE}/systems/${sys}/types`)) ??
			{}) as IDataObject;
		const available = expandModuleTypes(types);

		const bindings: Binding[] = rows.map((row, position) => {
			const slug = (row.moduleSlug ?? '').trim();
			const name = (row.statusKey ?? '').trim();
			if (slug === '' || name === '') {
				throw new NodeOperationError(
					this.getNode(),
					`Status value ${position + 1} needs both a module and a status key`,
				);
			}
			const { mod, index } = splitSlug(slug);
			if (!available.includes(moduleSlug(mod, index))) {
				throw new NodeOperationError(this.getNode(), `Module '${slug}' is not in system ${sys}`, {
					description: available.length
						? `Modules in the system: ${available.join(', ')}`
						: 'The system has no modules',
				});
			}
			return { sys, mod, index, name };
		});

		const emitInitialValue = options.emitInitialValue === true;
		const onlyOnChange = options.onlyOnChange !== false;
		const manual = this.getMode() === 'manual';
		const lastValues = new Map<string, { json: string; value: unknown }>();
		let manualEmitted = false;

		const emitItem = (binding: Binding, value: unknown, previous: unknown, initial: boolean) => {
			const item: IDataObject = {
				system_id: binding.sys,
				module: binding.mod,
				index: binding.index,
				module_slug: moduleSlug(binding.mod, binding.index),
				status: binding.name,
				value: value as IDataObject,
				previous_value: (previous === undefined ? null : previous) as IDataObject,
				initial,
				received_at: new Date().toISOString(),
			};
			this.emit([this.helpers.returnJsonArray([item])]);
		};

		const onNotify = (binding: Binding, value: unknown, info: NotifyInfo) => {
			const key = bindingKey(binding);
			const json = JSON.stringify(value ?? null);
			const last = lastValues.get(key);
			lastValues.set(key, { json, value });

			if (manual) {
				if (manualEmitted) return;
				manualEmitted = true;
				emitItem(binding, value, last?.value, info.snapshot);
				return;
			}
			if (info.snapshot && !info.reconnect) {
				if (emitInitialValue) emitItem(binding, value, undefined, true);
				return;
			}
			if (info.snapshot && info.reconnect) {
				if (last && last.json !== json) emitItem(binding, value, last.value, false);
				return;
			}
			if (onlyOnChange && last && last.json === json) return;
			emitItem(binding, value, last?.value, false);
		};

		const socket = new ControlSocket({
			url: controlSocketUrl(credentials.baseUrl, credentials.apiKey),
			bindings,
			onNotify,
			onFatal: (error) => {
				this.emitError(new NodeOperationError(this.getNode(), error));
			},
			logger: this.logger,
			pingIntervalMs: Math.max(5, options.pingInterval ?? 15) * 1000,
			maxReconnects: Math.max(0, options.reconnectAttempts ?? 10),
		});

		const closeFunction = async () => {
			socket.close();
		};

		const connect = async () => {
			try {
				await socket.connect();
			} catch (error) {
				socket.close();
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		};

		if (!manual) {
			await connect();
			return { closeFunction };
		}
		return { closeFunction, manualTriggerFunction: connect };
	}
}
