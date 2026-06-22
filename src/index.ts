interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * EDMtrain MCP.
 *
 * Electronic / dance music events, concerts and festivals across North America,
 * queried by region (lat/long radius ~75mi) or by EDMtrain location id. Powered
 * by the EDMtrain API (https://edmtrain.com/api). Requires a free `client` key:
 * the gateway fronts a platform key (PLATFORM_EDMTRAIN_KEY) and callers may also
 * pass their own via `_apiKey`. Request a free key at https://edmtrain.com/api.
 */


const BASE = 'https://edmtrain.com/api';
const UA = 'pipeworx-mcp-edmtrain/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'locations',
    description:
      'List EDMtrain-supported metro locations (id, city, state, lat/long). Use a location id with the events tool, or filter this list by a city/state keyword. EDMtrain covers North American metros.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional filter, e.g. "Los Angeles", "TX", "Brooklyn".' },
      },
    },
  },
  {
    name: 'events',
    description:
      'Find upcoming electronic/dance events, concerts and festivals for a region. Specify a region either by latitude+longitude (returns events within ~75 miles) or by location_ids. Optionally filter by date window, name, and festivals-only.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Region center latitude (pair with longitude), e.g. 37.77 for SF.' },
        longitude: { type: 'number', description: 'Region center longitude (pair with latitude), e.g. -122.42 for SF.' },
        location_ids: { type: 'string', description: 'Comma-separated EDMtrain location ids (from the locations tool). Alternative to lat/long.' },
        state: { type: 'string', description: 'Optional 2-letter state filter when using lat/long, e.g. "CA".' },
        start_date: { type: 'string', description: 'Earliest event date, YYYY-MM-DD.' },
        end_date: { type: 'string', description: 'Latest event date, YYYY-MM-DD.' },
        event_name: { type: 'string', description: 'Filter by event/festival name keyword.' },
        festivals_only: { type: 'boolean', description: 'If true, return only festivals.' },
        limit: { type: 'number', description: 'Max events to return (1-200, default 50).' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = keyOf(args);
  switch (name) {
    case 'locations':
      return getLocations(client, args);
    case 'events':
      return getEvents(client, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function getLocations(client: string, args: Record<string, unknown>): Promise<unknown> {
  const data = await etFetch('/locations', { client });
  let locs = (data as { data?: EtLocation[] }).data ?? [];
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  if (q) locs = locs.filter((l) => `${l.city} ${l.state} ${l.stateCode}`.toLowerCase().includes(q));
  return {
    count: locs.length,
    locations: locs.map((l) => ({ id: l.id, city: l.city, state: l.state, state_code: l.stateCode, latitude: l.latitude, longitude: l.longitude })),
  };
}

async function getEvents(client: string, args: Record<string, unknown>): Promise<unknown> {
  const params: Record<string, string> = { client };
  const hasLatLng = typeof args.latitude === 'number' && typeof args.longitude === 'number';
  const locationIds = typeof args.location_ids === 'string' ? args.location_ids.trim() : '';
  if (hasLatLng) {
    params.latitude = String(args.latitude);
    params.longitude = String(args.longitude);
    if (typeof args.state === 'string' && args.state.trim()) params.state = args.state.trim();
  } else if (locationIds) {
    params.locationIds = locationIds;
  } else {
    throw new Error('Specify a region: pass latitude + longitude, or location_ids (from the locations tool).');
  }
  if (typeof args.start_date === 'string' && args.start_date.trim()) params.startDate = args.start_date.trim();
  if (typeof args.end_date === 'string' && args.end_date.trim()) params.endDate = args.end_date.trim();
  if (typeof args.event_name === 'string' && args.event_name.trim()) params.eventName = args.event_name.trim();
  if (args.festivals_only === true) params.festivalInd = 'true';

  const data = await etFetch('/events', params);
  let events = (data as { data?: EtEvent[] }).data ?? [];
  const limit = clamp(numArg(args.limit, 50), 1, 200);
  const total = events.length;
  events = events.slice(0, limit);

  return {
    region: hasLatLng ? { latitude: args.latitude, longitude: args.longitude, radius_miles: 75 } : { location_ids: locationIds },
    genre_focus: 'electronic / dance music',
    total_matching: total,
    count: events.length,
    events: events.map(normalizeEvent),
  };
}

interface EtLocation { id: number; city: string; state: string; stateCode?: string; latitude: number; longitude: number }
interface EtArtist { id?: number; name?: string }
interface EtVenue { id?: number; name?: string; location?: string; address?: string; latitude?: number; longitude?: number }
interface EtEvent {
  id: number;
  link?: string;
  name?: string | null;
  ages?: string | null;
  festivalInd?: boolean;
  electronicGenreInd?: boolean;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  venue?: EtVenue;
  artistList?: EtArtist[];
}

function normalizeEvent(e: EtEvent): Record<string, unknown> {
  const artists = (e.artistList ?? []).map((a) => a.name).filter(Boolean);
  return {
    id: e.id,
    name: e.name || (artists.length ? artists.join(', ') : 'Event'),
    date: e.date,
    start_time: e.startTime ?? undefined,
    end_time: e.endTime ?? undefined,
    is_festival: Boolean(e.festivalInd),
    ages: e.ages ?? undefined,
    artists,
    venue: e.venue ? { name: e.venue.name, location: e.venue.location, address: e.venue.address } : undefined,
    url: e.link,
  };
}

async function etFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const body = await res.json().catch(() => ({}));
  const ok = (body as { success?: boolean }).success;
  if (!res.ok || ok === false) {
    const msg = (body as { message?: string }).message || `HTTP ${res.status}`;
    if (/client/i.test(msg)) {
      throw new Error(
        `EDMtrain: invalid or missing API key (${msg}). The platform key may be unset — pass your own free key via _apiKey (request one at https://edmtrain.com/api).`,
      );
    }
    throw new Error(`EDMtrain: ${msg}`);
  }
  return body;
}

function keyOf(args: Record<string, unknown>): string {
  const k = args._apiKey;
  if (typeof k !== 'string' || !k.trim()) {
    throw new Error('EDMtrain requires an API key. The gateway normally fronts a platform key; otherwise pass _apiKey (free key at https://edmtrain.com/api).');
  }
  delete args._apiKey;
  return k.trim();
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
