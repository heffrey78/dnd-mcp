// Minimal stdio JSON-RPC client for driving the built server in tests.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serverPath = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const cwd = path.dirname(path.dirname(path.dirname(serverPath)));

/**
 * Starts the MCP server, performs the initialize handshake and returns a handle.
 * `stdoutRaw` keeps everything the server wrote to stdout so tests can assert
 * that nothing but JSON-RPC ever appears there.
 */
export async function startServer() {
  const child = spawn('node', [serverPath], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdoutRaw = '';
  let stderrRaw = '';
  const pending = new Map();
  let buffer = '';

  child.stdout.on('data', chunk => {
    stdoutRaw += chunk;
    buffer += chunk;

    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // non-JSON noise is asserted on separately via stdoutRaw
      }

      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver(message);
      }
    }
  });

  child.stderr.on('data', chunk => { stderrRaw += chunk; });

  let nextId = 1;
  const send = (method, params) => {
    const id = nextId++;
    const resolved = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return resolved;
  };

  const notify = method => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  };

  const initResult = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-harness', version: '1.0.0' }
  });
  notify('notifications/initialized');

  return {
    initResult,
    send,
    listTools: () => send('tools/list', {}),
    callTool: (name, args) => send('tools/call', { name, arguments: args }),
    get stdoutRaw() { return stdoutRaw; },
    get stderrRaw() { return stderrRaw; },
    stop() {
      child.stdin.end();
      child.kill();
    }
  };
}

/** Parses the JSON payload out of an MCP tool result. */
export function toolJson(response) {
  return JSON.parse(response.result.content[0].text);
}
