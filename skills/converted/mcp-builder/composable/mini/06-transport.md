# Transport Options

Two main transports: **Streamable HTTP** (remote) and **stdio** (local). **Avoid SSE — deprecated in favor of streamable HTTP.**

## Streamable HTTP

**Best for:** remote servers, web services, multi-client scenarios.

**Characteristics:**
- Bidirectional communication over HTTP
- Supports multiple simultaneous clients
- Can be deployed as a web service
- Enables server-to-client notifications

**Use when:**
- Serving multiple clients simultaneously
- Deploying as a cloud service
- Integrating with web applications

For remote servers, prefer **stateless JSON** (simpler to scale and maintain than stateful sessions and streaming responses).

## stdio

**Best for:** local integrations, command-line tools.

**Characteristics:**
- Standard input/output stream communication
- Simple setup, no network configuration needed
- Runs as a subprocess of the client

**Use when:**
- Building tools for local development environments
- Integrating with desktop applications
- Single-user, single-session scenarios

**Note:** stdio servers must NOT log to stdout — use stderr for logging.

## Transport selection

| Criterion | stdio | Streamable HTTP |
|-----------|-------|-----------------|
| **Deployment** | Local | Remote |
| **Clients** | Single | Multiple |
| **Complexity** | Low | Medium |
| **Real-time** | No | Yes |

(Language-specific code for wiring up each transport lives in the Python and Node minis.)
