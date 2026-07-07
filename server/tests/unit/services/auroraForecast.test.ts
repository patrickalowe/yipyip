/**
 * Unit tests for the NOAA SWPC aurora forecast proxy (mapsService).
 * The upstream fetch is mocked; asserts threshold filtering and the
 * in-memory TTL cache (one upstream call serves repeated requests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAuroraForecast, clearAuroraForecastCache } from '../../../src/services/mapsService';

const NOAA_BODY = {
  'Observation Time': '2026-07-08T05:30:00Z',
  'Forecast Time': '2026-07-08T06:25:00Z',
  coordinates: [
    [200, 65, 40],   // kept
    [201, 65, 2],    // kept (== threshold)
    [10, -30, 0],    // dropped (below threshold)
    [11, -30, 1],    // dropped
  ],
};

describe('getAuroraForecast', () => {
  beforeEach(() => {
    clearAuroraForecastCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => NOAA_BODY,
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuroraForecastCache();
  });

  it('AURORA-SVC-001: filters sub-threshold cells and passes timestamps through', async () => {
    const data = await getAuroraForecast();
    expect(data.observationTime).toBe('2026-07-08T05:30:00Z');
    expect(data.forecastTime).toBe('2026-07-08T06:25:00Z');
    expect(data.points).toEqual([[200, 65, 40], [201, 65, 2]]);
  });

  it('AURORA-SVC-002: caches the upstream response — repeated calls fetch once', async () => {
    await getAuroraForecast();
    await getAuroraForecast();
    await getAuroraForecast();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('AURORA-SVC-003: upstream failure surfaces as a 502-shaped error', async () => {
    clearAuroraForecastCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(getAuroraForecast()).rejects.toMatchObject({ status: 502 });
  });
});
