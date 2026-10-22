import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	ITriggerFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type PlaceOsContext = IExecuteFunctions | ILoadOptionsFunctions | ITriggerFunctions;

export const ENGINE = '/api/engine/v2';
export const STAFF = '/api/staff/v1';

export const CREDENTIAL = 'placeOsApi';

export interface PlaceOsCredentials {
	baseUrl: string;
	apiKey: string;
	ignoreSSLIssues?: boolean;
}

export interface PlaceOsRequestOptions {
	qs?: IDataObject;
	body?: unknown;
	/** Sent verbatim with this content type instead of as JSON. */
	rawBody?: { data: string; contentType: string };
	/** Status codes treated as success in addition to 2xx. */
	allowStatus?: number[];
}

export interface PlaceOsResponse {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
}

const MAX_PAGES = 1000;

export function normaliseBaseUrl(url: string): string {
	return (url ?? '').trim().replace(/\/+$/, '');
}

export async function getPlaceOsCredentials(this: PlaceOsContext): Promise<PlaceOsCredentials> {
	const credentials = await this.getCredentials<PlaceOsCredentials>(CREDENTIAL);
	return { ...credentials, baseUrl: normaliseBaseUrl(credentials.baseUrl) };
}

/** Parses a response body that may arrive as a JSON string, an empty string or already parsed. */
export function parseBody(body: unknown): unknown {
	if (typeof body !== 'string') return body;
	if (body === '') return undefined;
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function bodyText(body: unknown, key: string): string | undefined {
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		const value = (body as IDataObject)[key];
		if (typeof value === 'string' && value.trim() !== '') return value;
	}
	return undefined;
}

/**
 * Turns a PlaceOS error response into a user-facing message and description.
 * Both APIs answer 403 with an empty body, so that case is always described here.
 */
export function mapPlaceOsError(
	statusCode: number,
	body: unknown,
	method: string,
	path: string,
): { message: string; description?: string } {
	const detail = bodyText(body, 'error') ?? bodyText(body, 'message');
	const route = `${method} ${path}`;
	switch (statusCode) {
		case 400:
			return {
				message: `PlaceOS could not process the request: ${detail ?? 'bad request'}`,
				description: bodyText(body, 'message') ?? route,
			};
		case 401:
			return {
				message: `PlaceOS rejected the API key${detail ? `: ${detail}` : ''}`,
				description:
					'Check that the key has not expired and that the Base URL is the domain the key was created for (not an IP address or an alias).',
			};
		case 403:
			return {
				message: `The API key is not allowed to call ${route}`,
				description:
					"Reading module functions and state, executing functions and listing zones need a key with the Support permission, or a group grant on the system's zones. Staff API calls need the 'public' scope.",
			};
		case 404:
			return { message: `PlaceOS could not find the resource${detail ? `: ${detail}` : ''}`, description: route };
		case 405:
			return { message: `PlaceOS does not allow this action now${detail ? `: ${detail}` : ''}`, description: route };
		case 409: {
			const bookings = body && typeof body === 'object' ? (body as IDataObject).bookings : undefined;
			if (Array.isArray(bookings)) {
				const ids = bookings.map((booking) => (booking as IDataObject).id).join(', ');
				return {
					message: 'The booking clashes with an existing booking',
					description: `Clashing booking IDs: ${ids || 'unknown'}`,
				};
			}
			return {
				message: `PlaceOS reported a conflict${detail ? `: ${detail}` : ''}`,
				description: 'The record changed since it was read. Fetch it again and retry.',
			};
		}
		case 410: {
			const limit = body && typeof body === 'object' ? (body as IDataObject).limit : undefined;
			return {
				message: 'The booking limit for this user has been reached',
				description: limit !== undefined ? `Limit: ${String(limit)}` : detail,
			};
		}
		case 422: {
			const failures = body && typeof body === 'object' ? (body as IDataObject).failures : undefined;
			if (Array.isArray(failures) && failures.length > 0) {
				const reasons = failures
					.map((failure) => {
						const { field, reason } = failure as IDataObject;
						return field ? `${String(field)}: ${String(reason)}` : String(reason);
					})
					.join('; ');
				return { message: `PlaceOS rejected the data: ${reasons}`, description: detail };
			}
			const parameter = bodyText(body, 'parameter');
			return {
				message: `PlaceOS rejected the data${detail ? `: ${detail}` : ''}`,
				description: parameter ? `Parameter: ${parameter}` : route,
			};
		}
		case 501:
			return {
				message: detail ?? 'This domain has no Staff API tenant configured',
				description: 'Staff API features need a tenant for this domain, set up in Backoffice.',
			};
		case 511:
			return {
				message: 'The calendar provider needs the API key user to sign in',
				description:
					"The tenant uses delegated calendar access, so calls run with the key user's own calendar sign-in. Use a non-delegated tenant, or a user who has signed in to the calendar provider.",
			};
		default:
			return { message: detail ?? `PlaceOS returned status ${statusCode}`, description: route };
	}
}

/** Sends one request to PlaceOS with the API key and returns status, headers and the parsed body. Throws a NodeApiError for any non-2xx status. */
export async function placeOsRequest(
	this: PlaceOsContext,
	method: IHttpRequestMethods,
	path: string,
	options: PlaceOsRequestOptions = {},
): Promise<PlaceOsResponse> {
	const credentials = await getPlaceOsCredentials.call(this);
	const headers: IDataObject = {
		Accept: 'application/json',
		'X-App-Name': 'n8n-nodes-placeos',
	};
	const request: IHttpRequestOptions = {
		method,
		url: `${credentials.baseUrl}${path}`,
		headers,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		skipSslCertificateValidation: credentials.ignoreSSLIssues === true,
	};
	if (options.qs && Object.keys(options.qs).length > 0) request.qs = options.qs;
	if (options.rawBody) {
		headers['Content-Type'] = options.rawBody.contentType;
		request.body = options.rawBody.data;
		request.json = false;
	} else if (options.body !== undefined) {
		// n8n's request helper drops an empty array body; PlaceOS execute routes require one.
		headers['Content-Type'] = 'application/json';
		request.body = JSON.stringify(options.body);
		request.json = false;
	} else {
		request.json = true;
	}

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL,
		request,
	)) as { statusCode: number; headers?: IDataObject; body: unknown };

	const statusCode = response.statusCode;
	const body = parseBody(response.body);
	if ((statusCode >= 200 && statusCode < 300) || options.allowStatus?.includes(statusCode)) {
		return { statusCode, headers: response.headers ?? {}, body };
	}

	const { message, description } = mapPlaceOsError(statusCode, body, method, path);
	throw new NodeApiError(
		this.getNode(),
		{ statusCode, body: body as JsonObject } as unknown as JsonObject,
		{ message, description, httpCode: String(statusCode) },
	);
}

export async function placeOsApiRequest(
	this: PlaceOsContext,
	method: IHttpRequestMethods,
	path: string,
	options: PlaceOsRequestOptions = {},
): Promise<unknown> {
	return (await placeOsRequest.call(this, method, path, options)).body;
}

/**
 * Returns the path and query of the `rel="next"` entry of a Link header, or undefined.
 * PlaceOS emits `<path?query>; rel="next"`, sometimes with an absolute URL.
 */
export function nextPageFromLink(link: unknown): string | undefined {
	if (typeof link !== 'string') return undefined;
	for (const part of link.split(',')) {
		const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
		if (!match) continue;
		const target = match[1].trim();
		if (/^https?:\/\//i.test(target)) {
			const url = new URL(target);
			return `${url.pathname}${url.search}`;
		}
		return target.startsWith('/') ? target : `/${target}`;
	}
	return undefined;
}

/**
 * Lists a collection route. With `limit` set, asks for at most that many rows and stops there;
 * without it, follows Link headers until the last page. `rowsOf` picks the rows out of a page body
 * for routes that wrap them in an object.
 */
export async function placeOsRequestList(
	this: PlaceOsContext,
	path: string,
	qs: IDataObject = {},
	limit?: number,
	pageSize = 500,
	rowsOf: (body: unknown) => IDataObject[] = (body) => (Array.isArray(body) ? (body as IDataObject[]) : []),
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const firstLimit = limit !== undefined ? Math.min(limit, 10000) : pageSize;
	let response = await placeOsRequest.call(this, 'GET', path, { qs: { ...qs, limit: firstLimit } });
	for (let page = 0; page < MAX_PAGES; page++) {
		const rows = rowsOf(response.body);
		results.push(...rows);
		if (limit !== undefined && results.length >= limit) return results.slice(0, limit);
		const next = nextPageFromLink(response.headers.link ?? response.headers.Link);
		if (!next || rows.length === 0) break;
		response = await placeOsRequest.call(this, 'GET', next);
	}
	return limit !== undefined ? results.slice(0, limit) : results;
}
