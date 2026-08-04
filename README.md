# mcp-edmtrain

EDMtrain MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `locations` | List EDMtrain-supported metro locations (id, city, state, lat/long). Use a location id with the events tool, or filter this list by a city/state keyword. EDMtrain covers North American metros. |
| `events` | Find upcoming electronic/dance events, concerts and festivals for a region. Specify a region either by latitude+longitude (returns events within ~75 miles) or by location_ids. Optionally filter by date window, name, and festivals-only. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "edmtrain": {
      "url": "https://gateway.pipeworx.io/edmtrain/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Edmtrain data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
