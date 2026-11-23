import { Hono } from 'hono';
import { createErrorResponse, defaultScrapingOptions } from '../../../../lib';
import { fetchOrCache } from '../../../../lib/services/price-service';
import { pegadaianConfig } from './config';
import { scrapePegadaian } from './scrape';

import type { Bindings } from '../../../../types';
const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
	const refresh = c.req.query('refresh') === 'true';
	const result = await fetchOrCache(c.env, pegadaianConfig.name, { refresh }, () =>
		scrapePegadaian(defaultScrapingOptions),
	);

	if (!result.success) {
		return c.json(createErrorResponse(result.error ?? 'Unknown error'), 500);
	}

	return c.json(result);
});

export default app;
