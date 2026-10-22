# Friction Log

Kept from the first hour of the build. One row per snag: what I was doing, what I expected vs. what happened, how bad it was, how I got around it, and what would have helped.

Severity: **High** = blocked progress · **Medium** = cost real time · **Low** = papercut.

| # | Task | Step | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | Pick an Alexa+ integration path | Read the hackathon FAQ | A way to test against a real Alexa+ device or the official Web Simulator | Alexa+ dev tools (Category SDK, MCP Toolkit, Web Simulator) are partner-only; nobody can connect a real device | High | Built our own browser-based simulator that is a genuine MCP client over Streamable HTTP | Open a public sandbox (even text-only) of the Alexa+ MCP host so builders can verify tool calls end to end |
| 2 | Choose an MCP spec version | Compare spec site with SDK | The "current" spec and the hackathon's required version line up | Spec site lists 2026-07-28 (no initialize handshake) as current, while the rules ask for 2025-11-25 with initialize | Medium | Pinned `@modelcontextprotocol/sdk` to 1.32.1, whose latest negotiated version is 2025-11-25 | State in the rules which later spec revisions are accepted, and which SDK major to use |
| 3 | Install the MCP SDK | `npm i @modelcontextprotocol/sdk@1.32.1` | `require('…/package.json')` prints the version | Package `exports` hides `package.json`, so the usual version check prints `undefined` | Low | Read the version straight from the file on disk | Export `./package.json` or a `VERSION` constant |
| 4 | Stateless Streamable HTTP | Wire the transport into a plain Node `http` server | One shared server + transport handles all requests | In stateless mode a transport must not be reused across requests; the examples use Express | Low | Create a fresh `McpServer` + transport per POST | Add a no-framework `node:http` example to the SDK README |
| 5 | Browser as MCP client | Call `/mcp` from the web page | Plain `fetch` works | Needs CORS for `Content-Type`, `MCP-Protocol-Version`, `Mcp-Session-Id` and an `Accept: application/json, text/event-stream` header or the server answers 406 | Medium | Set the CORS headers and `Accept` explicitly; turned on JSON responses | Document the exact headers a browser client must send in one place |
