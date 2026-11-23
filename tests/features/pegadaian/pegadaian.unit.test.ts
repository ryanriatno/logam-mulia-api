import { describe, expect, it } from 'vitest';
import { getLatestPrice, pegadaianPostProcess } from '../../../src/features/api/prices/pegadaian/config';
import { parseBarPrices } from '../../../src/features/api/prices/pegadaian/scrape';

describe('pegadaian getLatestPrice', () => {
	const sellSeries = {
		tipe: 'jual',
		updateDate: '2026-06-30T00:00:00.000Z',
		jsonFluktuasi: {
			priceList: [
				{ harga: '25240', lastUpdate: '2026-06-30 00:00:00' },
				{ harga: '25450', lastUpdate: '2026-06-29 00:00:00' },
				{ harga: '25550', lastUpdate: '2026-06-28 00:00:00' },
			],
		},
	};

	it('returns latest price when lastUpdate matches updateDate', () => {
		expect(getLatestPrice(sellSeries)).toBe('25240');
	});

	it('returns empty string when lastUpdate mismatches updateDate (stale data)', () => {
		const staleSeries = {
			...sellSeries,
			// Only older entries, no match for today's updateDate
			jsonFluktuasi: {
				priceList: [
					{ harga: '25450', lastUpdate: '2026-06-29 00:00:00' },
				],
			},
		};
		expect(getLatestPrice(staleSeries)).toBe('');
	});

	it('returns price if dates missing (fallback)', () => {
		const noDates = {
			tipe: 'jual',
			jsonFluktuasi: {
				priceList: [
					{ harga: '99999' },
				],
			},
		};
		expect(getLatestPrice(noDates)).toBe('99999');
	});

	it('returns empty string for empty priceList', () => {
		const empty = {
			tipe: 'jual',
			updateDate: '2026-06-30T00:00:00.000Z',
			jsonFluktuasi: { priceList: [] },
		};
		expect(getLatestPrice(empty)).toBe('');
	});

	it('returns empty string for undefined series', () => {
		expect(getLatestPrice(undefined)).toBe('');
	});

	it('returns empty string for series without jsonFluktuasi', () => {
		expect(getLatestPrice({} as Record<string, unknown>)).toBe('');
	});

	it('picks first (newest) entry, not last', () => {
		const series = {
			tipe: 'jual',
			updateDate: '2026-06-30T00:00:00.000Z',
			jsonFluktuasi: {
				priceList: [
					{ harga: '100', lastUpdate: '2026-06-30 00:00:00' },
					{ harga: '200', lastUpdate: '2026-06-29 00:00:00' },
					{ harga: '300', lastUpdate: '2026-06-28 00:00:00' },
				],
			},
		};
		expect(getLatestPrice(series)).toBe('100');
	});
});

describe('pegadaian pegadaianPostProcess', () => {
	const validPayload = {
		responseCode: '2000000100',
		data: {
			allGrafik: [
				{
					tipe: 'jual',
					updateDate: '2026-06-30T00:00:00.000Z',
					jsonFluktuasi: {
						priceList: [{ harga: '25240', lastUpdate: '2026-06-30 00:00:00' }],
					},
				},
				{
					tipe: 'beli',
					updateDate: '2026-06-30T00:00:00.000Z',
					jsonFluktuasi: {
						priceList: [{ harga: '23970', lastUpdate: '2026-06-30 00:00:00' }],
					},
				},
			],
		},
	};

	it('returns hargaJual and hargaBeli from valid payload', () => {
		const result = pegadaianPostProcess(validPayload);
		expect(result).toEqual({ hargaJual: '25240', hargaBeli: '23970' });
	});

	it('returns empty strings when allGrafik missing', () => {
		const result = pegadaianPostProcess({ data: {} });
		expect(result).toEqual({ hargaJual: '', hargaBeli: '' });
	});

	it('returns empty strings when data missing', () => {
		const result = pegadaianPostProcess({});
		expect(result).toEqual({ hargaJual: '', hargaBeli: '' });
	});
});

describe('pegadaian parseBarPrices', () => {
	const payload = {
		responseCode: '2000000100',
		data: [
			{
				namaVendor: 'UBS',
				hargaMuliaDetails: [
					{ berat: 5, hargaJual: 11636000, hargaBeli: null },
					{ berat: 0.2, hargaJual: 0, hargaBeli: null },
					{ berat: 1, hargaJual: 2373000, hargaBeli: null },
				],
			},
			{
				namaVendor: 'ANTAM',
				hargaMuliaDetails: [{ berat: 1, hargaJual: 2543000, hargaBeli: 2300000 }],
			},
		],
	};

	it('maps each vendor/weight with a price to a row, sorted by weight', () => {
		expect(parseBarPrices(payload)).toEqual([
			{ material: 'gold', materialType: 'UBS', weight: 1, weightUnit: 'gram', sellPrice: 2373000, buybackPrice: null },
			{ material: 'gold', materialType: 'UBS', weight: 5, weightUnit: 'gram', sellPrice: 11636000, buybackPrice: null },
			{ material: 'gold', materialType: 'ANTAM', weight: 1, weightUnit: 'gram', sellPrice: 2543000, buybackPrice: 2300000 },
		]);
	});

	it('skips vendors without a name or details', () => {
		expect(parseBarPrices({ data: [{ hargaMuliaDetails: [{ berat: 1, hargaJual: 1 }] }, { namaVendor: 'X' }] })).toEqual([]);
	});

	it('returns empty array when data is not an array', () => {
		expect(parseBarPrices({})).toEqual([]);
		expect(parseBarPrices(null)).toEqual([]);
	});
});
