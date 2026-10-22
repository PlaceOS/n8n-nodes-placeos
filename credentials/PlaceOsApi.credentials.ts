import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PlaceOsApi implements ICredentialType {
	name = 'placeOsApi';

	displayName = 'PlaceOS API';

	icon: Icon = { light: 'file:icons/placeos.svg', dark: 'file:icons/placeos.dark.svg' };

	documentationUrl = 'https://github.com/PlaceOS/n8n-nodes-placeos?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. https://placeos.example.com',
			description:
				'The PlaceOS domain the API key belongs to. Use the domain itself, not an IP address or an alias: PlaceOS matches the key to the host it is called on.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Created in PlaceOS Backoffice under Admin, API Keys. It is shown once, when it is created.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSSLIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if SSL certificate validation is not possible. Applies to API requests only, not to the PlaceOS Trigger connection.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/engine/v2/api_keys/inspect',
			skipSslCertificateValidation: '={{$credentials.ignoreSSLIssues}}',
		},
	};
}
