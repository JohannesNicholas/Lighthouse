// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import L from 'leaflet';
import AmazonLocationRouter from './als.js';

const wp = (lat, lng) => ({ latLng: L.latLng(lat, lng) });

const route = (overrides = {}) => ({
  Legs: [
    { Geometry: { LineString: [[151.0, -33.0], [151.0, -33.1]] } },
    { Geometry: { LineString: [[151.0, -33.1], [151.1, -33.1]] } },
  ],
  Summary: { Overview: { Distance: 20000.4, Duration: 1800.6 } },
  MajorRoadLabels: [{ RoadName: { Value: 'Princes Hwy' } }],
  ...overrides,
});

const okFetch = (body) => vi.fn().mockResolvedValue({ ok: true, json: async () => body, text: async () => '' });

const call = (router, wps = [wp(-33, 151), wp(-33.1, 151.1)]) =>
  new Promise((resolve) => router.route(wps, (err, routes) => resolve({ err, routes })));

afterEach(() => vi.restoreAllMocks());

describe('AmazonLocationRouter constructor', () => {
  it('requires a serviceUrl', () => {
    expect(() => new AmazonLocationRouter()).toThrow(/serviceUrl is required/);
  });

  it('applies defaults', () => {
    const r = new AmazonLocationRouter({ serviceUrl: 'https://x', fetch: vi.fn() });
    expect(r.options.travelMode).toBe('Car');
    expect(r.options.timeoutMs).toBe(15000);
    expect(r.options.headers).toEqual({});
  });
});

describe('AmazonLocationRouter.route', () => {
  it('POSTs [lng,lat] coordinates with the travel mode and merged headers', async () => {
    const fetch = okFetch({ Routes: [route()] });
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch, travelMode: 'Truck', headers: { 'x-api-key': 'k' } });
    await call(router);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://svc');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': 'k' });
    expect(JSON.parse(init.body)).toEqual({ coordinates: [[151, -33], [151.1, -33.1]], travelMode: 'Truck' });
  });

  it('accepts plain {lat,lng} waypoints as well as Leaflet Routing Machine ones', async () => {
    const fetch = okFetch({ Routes: [route()] });
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch });
    const { err } = await call(router, [{ lat: -33, lng: 151 }, { lat: -33.1, lng: 151.1 }]);
    expect(err).toBeNull();
  });

  it('rejects an invalid waypoint through the callback, not a throw', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: vi.fn() });
    const { err } = await call(router, [{ nope: 1 }, { lat: 1, lng: 2 }]);
    expect(err.message).toMatch(/invalid waypoint/);
  });

  it('returns every alternative route', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Routes: [route(), route()] }) });
    const { err, routes } = await call(router);
    expect(err).toBeNull();
    expect(routes).toHaveLength(2);
  });

  it('builds LRM routes: de-duplicated joint vertices, rounded totals, via label', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Routes: [route()] }) });
    const { routes } = await call(router);
    const r = routes[0];
    expect(r.coordinates).toHaveLength(3); // joint vertex not repeated
    expect(r.coordinates[0]).toBeInstanceOf(L.LatLng);
    expect(r.name).toBe('Princes Hwy');
    expect(r.summary.totalDistance).toBe(20000);
    expect(r.summary.totalTime).toBe(1801);
    expect(r.summary.routeLabel).toBe('via Princes Hwy');
    expect(r.instructions).toEqual([]);
    expect(r.waypoints).toHaveLength(2);
  });

  it('falls back to a numbered name and geometry distance without summary or road labels', async () => {
    const bare = { Legs: route().Legs };
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Routes: [bare] }) });
    const { routes } = await call(router);
    expect(routes[0].name).toBe('#1');
    expect(routes[0].summary.routeLabel).toBeNull();
    expect(routes[0].summary.totalDistance).toBe(0);
    expect(routes[0].summary.midpoint.totalDistanceMeters).toBeGreaterThan(10000);
  });

  it('understands lower-case response keys and a bare array', async () => {
    const lower = {
      legs: [{ geometry: { lineString: [[151, -33], [151.1, -33.1]] } }],
      summary: { overview: { Distance: 5000, Duration: 60 } },
    };
    for (const body of [{ routes: [lower] }, [lower]]) {
      const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch(body) });
      const { err, routes } = await call(router);
      expect(err).toBeNull();
      expect(routes[0].summary.totalDistance).toBe(5000);
    }
  });

  it('skips a broken alternative but keeps the good ones', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Routes: [{ Legs: [] }, route()] }) });
    const { err, routes } = await call(router);
    expect(err).toBeNull();
    expect(routes).toHaveLength(1);
    expect(routes[0].summary.routeIndex).toBe(1);
  });

  it('errors when the response has no routes', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Nothing: 1 }) });
    const { err } = await call(router);
    expect(err.message).toMatch(/missing Routes/);
  });

  it('errors with the HTTP status and body on a non-2xx response', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch });
    const { err } = await call(router);
    expect(err.message).toBe('ALS router HTTP 403: forbidden');
  });

  it('passes network failures to the callback', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    const { err } = await call(router);
    expect(err.message).toBe('offline');
  });

  it('calls back with the supplied context', async () => {
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: okFetch({ Routes: [route()] }) });
    const ctx = {};
    const seen = await new Promise((resolve) => router.route([wp(-33, 151), wp(-33.1, 151.1)], function () { resolve(this); }, ctx));
    expect(seen).toBe(ctx);
  });

  it('aborts the request after the timeout', async () => {
    vi.useFakeTimers();
    let signal;
    const fetch = vi.fn((_u, init) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch, timeoutMs: 500 });
    router.route([wp(-33, 151), wp(-33.1, 151.1)], () => {});
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(501);
    expect(signal.aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe('AmazonLocationRouter._computeRouteMidpoint', () => {
  const router = new AmazonLocationRouter({ serviceUrl: 'https://svc', fetch: vi.fn() });

  it('is null for fewer than two points or zero length', () => {
    expect(router._computeRouteMidpoint([], 0)).toBeNull();
    expect(router._computeRouteMidpoint([L.latLng(0, 0)], 10)).toBeNull();
    expect(router._computeRouteMidpoint([L.latLng(1, 1), L.latLng(1, 1)])).toBeNull();
  });

  it('finds the halfway point of a straight two-point line', () => {
    const m = router._computeRouteMidpoint([L.latLng(0, 0), L.latLng(0, 2)]);
    expect(m.lat).toBeCloseTo(0, 6);
    expect(m.lng).toBeCloseTo(1, 4);
    expect(m.segmentIndex).toBe(0);
    expect(m.t).toBeCloseTo(0.5, 4);
  });

  it('picks the right segment on a longer polyline', () => {
    const pts = [L.latLng(0, 0), L.latLng(0, 1), L.latLng(0, 4)];
    const m = router._computeRouteMidpoint(pts);
    expect(m.segmentIndex).toBe(1);
    expect(m.lng).toBeCloseTo(2, 3);
  });

  it('uses a supplied total distance when positive', () => {
    const m = router._computeRouteMidpoint([L.latLng(0, 0), L.latLng(0, 2)], 1000);
    expect(m.totalDistanceMeters).toBe(1000);
    expect(m.atDistanceMeters).toBe(500);
  });
});
