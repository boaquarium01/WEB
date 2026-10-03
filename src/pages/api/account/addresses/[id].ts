import type { APIRoute } from 'astro';
import { jsonError, jsonOk, requireUser } from '../../../../lib/http';
import {
	deleteAddressForUser,
	updateAddressForUser,
} from '../../../../lib/services/address';

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	const addressId = context.params.id;
	if (!addressId) return jsonError('Missing address id', 400);

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

		const updated = await updateAddressForUser(user.id, addressId, body);
		return jsonOk(updated);
	} catch (error) {
		const message = error instanceof Error ? error.message : '更新失敗';
		const status = message === 'Address not found' ? 404 : 400;
		return jsonError(message, status);
	}
};

export const DELETE: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	const addressId = context.params.id;
	if (!addressId) return jsonError('Missing address id', 400);

	try {
		await deleteAddressForUser(user.id, addressId);
		return jsonOk({ id: addressId });
	} catch (error) {
		const message = error instanceof Error ? error.message : '刪除失敗';
		const status = message === 'Address not found' ? 404 : 400;
		return jsonError(message, status);
	}
};
