import { AxiosScraper, parseCurrency } from '../../../../lib';
import type { ScrapingOptions } from '../../../../lib/types/scraper.types';
import { pegadaianConfig, PEGADAIAN_BAR_PRICES_URL } from './config';

export interface PegadaianRow {
	material: string;
	materialType: string;
	weight: number;
	weightUnit: string;
	sellPrice: number;
	buybackPrice: number | null;
}

interface BarDetail {
	berat?: number;
	hargaJual?: number | null;
	hargaBeli?: number | null;
}

interface BarVendor {
	namaVendor?: string;
	hargaMuliaDetails?: BarDetail[];
}

export function parseBarPrices(raw: unknown): PegadaianRow[] {
	const vendors = (raw as { data?: unknown })?.data;
	if (!Array.isArray(vendors)) return [];

	return (vendors as BarVendor[]).flatMap((vendor) => {
		const name = vendor.namaVendor?.trim();
		if (!name || !Array.isArray(vendor.hargaMuliaDetails)) return [];

		return vendor.hargaMuliaDetails
			.filter((d) => typeof d.berat === 'number' && (d.hargaJual ?? 0) > 0)
			.sort((a, b) => (a.berat as number) - (b.berat as number))
			.map((d) => ({
				material: 'gold',
				materialType: name,
				weight: d.berat as number,
				weightUnit: 'gram',
				sellPrice: d.hargaJual as number,
				buybackPrice: d.hargaBeli && d.hargaBeli > 0 ? d.hargaBeli : null,
			}));
	});
}

async function fetchBarPrices(options?: ScrapingOptions): Promise<PegadaianRow[]> {
	const response = await fetch(PEGADAIAN_BAR_PRICES_URL, {
		headers: { Accept: 'application/json', ...(options?.headers ?? {}) },
		signal: AbortSignal.timeout(options?.timeout ?? 10000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	return parseBarPrices(await response.json());
}

const savingsScraper = new AxiosScraper('pegadaian', pegadaianConfig);

async function fetchSavingsPrice(options?: ScrapingOptions): Promise<PegadaianRow[]> {
	const result = await savingsScraper.scrape(
		(raw) => ({
			material: 'gold',
			materialType: 'Tabungan Emas',
			weight: Number(raw.weight),
			weightUnit: raw.weightUnit,
			sellPrice: parseCurrency(raw.sellPrice),
			buybackPrice: parseCurrency(raw.buybackPrice) || null,
		}),
		options,
	);
	if (!result.success) throw new Error(result.error ?? 'Unknown error');
	return (result.data as PegadaianRow[]).filter((row) => row.sellPrice > 0);
}

export async function scrapePegadaian(options?: ScrapingOptions) {
	const timestamp = new Date().toISOString();
	const base = { timestamp, source: pegadaianConfig.name, currency: pegadaianConfig.currency };

	const [savings, bars] = await Promise.allSettled([fetchSavingsPrice(options), fetchBarPrices(options)]);
	const rows = [
		...(savings.status === 'fulfilled' ? savings.value : []),
		...(bars.status === 'fulfilled' ? bars.value : []),
	];

	if (rows.length === 0) {
		const reasons = [savings, bars]
			.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
			.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
		return { ...base, success: false, error: reasons.join('; ') || 'No prices found' };
	}

	return { ...base, success: true, data: rows };
}
