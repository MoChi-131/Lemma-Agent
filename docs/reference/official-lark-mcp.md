# Official Lark MCP

Lemma runs `@larksuiteoapi/lark-mcp@0.5.1` as a private stdio child process. It is not exposed as a second HTTP service.

## Requirements

- Node.js 20+
- `LARK_APP_ID` and `LARK_APP_SECRET`
- Lark scopes: `docx:document`, `wiki:wiki`, plus read scopes required by enabled tools
- The app or its Bot group is an administrator of the target Wiki space

## Behavior

- Reads use tenant identity by default.
- Writes create a new Docx Wiki child, write converted Markdown blocks, then read it back.
- The allowed official tools are fixed in `integrations/lark/official-mcp/constants.js`.
- Logs keep operation, duration, and safe Lark code; they never print credentials or document payloads.

## Deploy and verify

```powershell
npm ci
npm.cmd test
npm.cmd run mcp:http
```

Keep port `6688` private. Use HTTPS plus an authenticated public endpoint or Secure MCP Tunnel for ChatGPT access.
