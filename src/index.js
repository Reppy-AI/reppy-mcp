#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readApiKey, errorResult, ReppyError } from 'reppy-cli/client';
import { createServer } from './server.js';

try {
  if (process.argv.length !== 2) throw new ReppyError('ARGUMENTS');
  await readApiKey(process.env.REPPY_API_KEY_FILE);
  await createServer().connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(JSON.stringify(errorResult(error)) + '\n');
  process.exitCode = 1;
}
