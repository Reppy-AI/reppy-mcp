import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createClient, errorResult, ID_PATTERN } from 'reppy-cli/client';

export function createServer(client = createClient()) {
  const server = new McpServer({ name: 'reppy', version: '0.1.0' });
  const empty = z.object({}).strict();
  const page = z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of items, default 25.'),
    offset: z.number().int().min(0).max(100000).optional().describe('Number of items to skip, default 0.')
  }).strict();
  const detail = z.object({ id: z.string().regex(ID_PATTERN).describe('Resource ID from a list result.') }).strict();
  for (const [name, operation, description, inputSchema] of [
    ['ping', 'ping', 'Check the Reppy public API with your key.', empty],
    ['get_account', 'me', 'Read your bound Reppy account ID.', empty],
    ['list_routines', 'routines', 'Read routine summaries. Requires routines:read permission.', page],
    ['get_routine', 'routines', 'Read an owned routine. Requires routines:read permission.', detail],
    ['list_workouts', 'workouts', 'Read workout summaries. Requires workouts:read permission.', page],
    ['get_workout', 'workouts', 'Read an owned workout. Requires workouts:read permission.', detail]
  ]) {
    server.registerTool(name, {
      description, inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    }, async args => {
      try {
        const result = await client.request(operation, args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const result = errorResult(error);
        return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      }
    });
  }
  return server;
}
