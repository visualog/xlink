import { callTool, listTools } from "./tools.js";

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function writeResponse(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function writeError(id, code, message) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function handleMessage(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    return writeResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "xlink-mcp",
        version: "0.1.0"
      }
    });
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    return writeResponse(id, {
      tools: listTools()
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};

    return callTool(toolName, args)
      .then((payload) => {
        writeResponse(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload, null, 2)
            }
          ]
        });
      })
      .catch((error) => {
        writeError(id, -32000, error.message);
      });
  }

  writeError(id, -32601, `Method not found: ${method}`);
}

let buffer = Buffer.alloc(0);

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.subarray(0, headerEnd).toString("utf8");
    const headers = headerText.split("\r\n");
    const lengthHeader = headers.find((line) => line.toLowerCase().startsWith("content-length:"));

    if (!lengthHeader) {
      throw new Error("Missing Content-Length header");
    }

    const contentLength = Number(lengthHeader.split(":")[1].trim());
    const messageEnd = headerEnd + 4 + contentLength;

    if (buffer.length < messageEnd) {
      return;
    }

    const body = buffer.subarray(headerEnd + 4, messageEnd).toString("utf8");
    buffer = buffer.subarray(messageEnd);
    handleMessage(JSON.parse(body));
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  try {
    processBuffer();
  } catch (error) {
    writeError(null, -32700, error.message);
  }
});
