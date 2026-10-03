import type { APIRoute } from 'astro';
import { jsonError, jsonOk, requireUser } from '../../../../lib/http';
import {
	createAddressForUser,
	listAddressesForUser,
} from '../../../../lib/services/address';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	const rows = await listAddressesForUser(user.id);
	return jsonOk(rows);
};

export const POST: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	try {
		const body = (await context.request.json()) as {
			label?: string;
			recipientName?: string;
			phone?: string;
			postalCode?: string;
			city?: string;
			district?: string;
			addressLine?: string;
			isDefault?: boolean;
		};

		const created = await createAddressForUser(user.id, {
			label: body.label,
			recipientName: body.recipientName ?? '',
			phone: body.phone ?? '',
			postalCode: body.postalCode ?? '',
			city: body.city ?? '',
			district: body.district ?? '',
			addressLine: body.addressLine ?? '',
			isDefault: body.isDefault,
		});

		return jsonOk(created, 201);
	} catch (error) {
		return jsonError(
			error instanceof Error ? error.message : '新增地址失敗',
			400,
		);
	}
};
