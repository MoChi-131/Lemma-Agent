# Lemma Agent

Lemma 是 Supermama 的 Lark 知識檢索與文件發布 MCP service，支援 **Streamable HTTP** 與 **stdio**。本專案負責檢索規則、內容讀取、人工批准後的 Wiki 文件建立，以及執行日誌。

## 分支與版本 Branch status

以下為 **2026-11-16** 核對的狀態；本 README 的操作說明以目前本機 feature branch 為準。

| 項目 | `main` | `feature/v1.2.0-mcp` |
| --- | --- | --- |
| 核對的 commit | 遠端 `origin/main`：`fc7f546` | 本機 HEAD：`2940c88` |
| `package.json` version | `1.1.0` | `1.2.0` |
| 對外介面 | 自建 MCP server，支援 HTTP / stdio | 同樣由 Lemma 提供 HTTP / stdio MCP server |
| Lark integration | 自建 adapter 直接呼叫 Lark OpenAPI | 整合官方 `@larksuiteoapi/lark-mcp@0.5.1`，透過 private stdio worker 呼叫 |
| 官方 MCP dependency | 無 | 有，固定版本 `0.5.1` |
| HTTP probes | `/health` | `/health`、`/ready` |
| Logging | 基本 HTTP request / session 日誌 | 統一彩色 logger、tool execution、partial-result 警告與 error webhook |

**`main` 本身也是 MCP service**，差別在它連接 Lark 的方式。feature branch 將相關 Lark operations 交給官方 MCP worker，Lemma 繼續負責 governance、資源處理與對外 tool contracts；不是直接把官方所有 tools 公開給 client。

部署時請在實際執行服務的環境核對：

```sh
git branch --show-current
git log -1 --oneline
node -p "require('./package.json').version"
```

本機檔案、GitHub branch 與 Codespaces running process 可能不同步。更新程式碼後需要重啟；`/health` 的 version 來自 `package.json`，無法單靠它辨識上述兩個分支。

## 主要功能 Capabilities

- 搜尋已發布的 knowledge metadata，讀取符合 eligibility 規則的文件。
- 探索 Wiki tree、literal text search，以及 subtree 文件內容。
- 讀取文字、native tables、embedded Sheets、圖片、whiteboards 與支援的 PDF attachments；不完整結果會明確標示。
- 在 external search 與 URL 使用前檢查 approved domains。
- 使用者批准 title、完整內容及位置後，建立新 Wiki document 並 read back 驗證。

### 與 Knowledge-Base-Agent 的分工

**Knowledge-Base-Agent** 管理 working Registry、驗證與 **Validated Metadata** 發布。

**Lemma-Agent** 讀取 Validated Metadata 與 **Validation Journal**，使用最後一份完整且已驗證的 publication，不回退到同事正在編輯的 working Registry。

兩者是獨立 repository 與 service，各有自己的版本號。更新 Knowledge-Base-Agent 不會自動更新 Lemma 或 connector。

## 快速開始 Quick start

### 1. 安裝 dependencies

準備 Node.js 20+ 與 npm，在 repository root 執行：

```sh
npm ci
```

Windows PowerShell 若阻擋 `npm.ps1`，可改用 `npm.cmd`。

### 2. 設定 `.env`

複製 [.env.example](.env.example) 為 `.env`，設定：

```dotenv
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
LARK_VALIDATED_METADATA_URL=https://your-tenant.larksuite.com/base/BASE_TOKEN?table=VALIDATED_TABLE_ID
LARK_VALIDATION_JOURNAL_URL=https://your-tenant.larksuite.com/base/BASE_TOKEN?table=JOURNAL_TABLE_ID
PORT=6688
```

Lark app 需具備所用 tools 的 scopes，以及目標 Wiki、documents、Base tables 的存取權。只有 App ID / Secret 不代表能讀取所有資料。詳見 [Official Lark MCP 設定](docs/reference/official-lark-mcp.md)。

`.env` 僅留在執行環境，不提交到 Git，也不要將內容貼入 logs 或支援訊息。

### 3. 啟動 MCP

HTTP client 或 tunnel 使用：

```sh
npm run mcp:http
```

由 client 啟動本機 stdio process 時使用：

```sh
npm run mcp:start
```

stdio 不使用 port。feature branch 的官方 Lark MCP worker 也透過 private stdio 運行，不需要第二個 public endpoint。

## HTTP endpoints 與部署

預設 port 為 `6688`，可用 `PORT` 覆寫。

| Endpoint | 用途 | 成功代表什麼 |
| --- | --- | --- |
| `GET /health` | Liveness、version、active sessions | HTTP process 有回應 |
| `GET /ready` | Configuration probe，回傳 200 / 503；feature branch 提供 | App ID / Secret 已設定且非空白 |
| `/mcp` | Streamable HTTP MCP | Client 需完成 initialize / session 流程 |

兩個 probe 都不呼叫 Lark。`/ready` 成功不代表 credentials 有效、scopes 齊全或 metadata table 可讀。直接在 browser 開 `/mcp` 也不是完整的 MCP connection test。

Remote connector 應指向 HTTPS tunnel / gateway 的 `/mcp` URL。HTTP application 本身沒有 authentication，應透過具驗證的 gateway 或 secure tunnel 提供存取。

修改 code、environment variables 或 port 後需 restart。若 port 改變，也要更新 forwarded port、tunnel target 及 connector URL。

## 檢索與發布 Workflow

### Knowledge retrieval

1. 使用 `search_knowledge_registry` 搜尋已發布 metadata。
2. 對選定且 eligible 的來源呼叫 `retrieve_knowledge_document`。
3. 需要 fallback 時使用 `search_lark_wiki`；搜尋到 Wiki 不等於已符合正式知識檢索條件。

正式來源需為完整的 Knowledge Base record，Status 為 `Approved`，Authority 為 `Internal Official` 或 `Reference`。Workspace records 不作為正式知識來源。

External-web approval 是獨立規則：先呼叫 `get_approved_web_domains`，限制搜尋範圍，再用 `check_external_urls` 檢查要讀取或引用的 URL。詳見 [Knowledge retrieval rules](docs/reference/knowledge-registry.md)。

### 建立 Wiki document

預設停用寫入。需要發布時設定：

```dotenv
LARK_DOCUMENT_WIKI_ROOT_URL=https://your-tenant.larksuite.com/wiki/ROOT_TOKEN
ENABLE_LARK_DOCUMENT_WRITES=true
```

使用者需先審閱並批准 title、完整內容與 destination。Lark app 也需具備目標位置的建立與讀寫權限。

`publish_approved_document` 建立新文件後會 read back 驗證，不負責修改或刪除既有文件、上傳原始附件或更新 knowledge metadata。若寫入結果不明，先在 Lark 檢查再決定是否重試，避免建立重複文件。詳見 [Publication contract](docs/reference/document-publication.md)。

## 環境變數 Configuration

| Variable | 用途 |
| --- | --- |
| `LARK_APP_ID`, `LARK_APP_SECRET` | Lark application credentials |
| `LARK_VALIDATED_METADATA_URL` | 已發布的 metadata table |
| `LARK_VALIDATION_JOURNAL_URL` | 確認完整 publication 的 Journal |
| `LARK_WHITELIST_URL` | 選填，覆寫 external-domain whitelist 來源 |
| `PORT` | HTTP port，預設 `6688` |
| `LARK_DOCUMENT_WIKI_ROOT_URL` | 可建立文件的 Wiki root |
| `ENABLE_LARK_DOCUMENT_WRITES` | 開啟受批准流程保護的寫入，預設 `false` |
| `LEMMA_LARK_USER_OAUTH` | 僅限本機單一使用者寫入測試，需事先完成官方 Lark OAuth login；不適用 shared production deployment |
| `LOG_COLOR` | `auto`、`always`、`never`；設定 `NO_COLOR` 可關閉顏色 |
| `LOG_RETENTION_DAYS` | Log pruning 保留天數，預設 `14` |
| `ERROR_WEBHOOK_URL` | 選填，可信任的 HTTPS incident webhook |

`feature/v1.2.0-mcp` 分支名稱不代表已有 production per-user OAuth。請依現有實作及部署環境確認 authentication 設計。

## 日誌 Logs 與故障排查

Logs 顯示在執行 service 的 terminal，HTTP / stdio 都寫入 **stderr**；stdio 的 stdout 保留給 MCP protocol。

feature branch 的 logger 包含 UTC timestamp、level，以及適用的 request / operation ID、status、duration。`INFO` 為青色、`OK` 綠色、`WARN` 黃色、`ERROR` 紅色。Partial results 與 tool failures 會另行記錄；HTTP 200 不等於 tool 執行成功。

不記錄 arguments、文件正文、session tokens 或 headers。Error summary 會遮蔽設定中的 secrets 與 URLs，省略 upstream JSON payload、raw stack，並限制長度為 180 characters。

| 現象 | 檢查方向 |
| --- | --- |
| Connector 401，沒有對應 HTTP request log | 核對 connector URL、tunnel authorization、forwarded port 與 running process；請求可能未到達 Lemma |
| `/ready` 回傳 503 | 確認 App ID / Secret 已設定，再 restart |
| Initialize 400，或舊 session 404 | 讓 MCP client reconnect，尤其是 server 重啟後 |
| Tool 回報 Lark access / authorization error | 檢查 redacted error、credentials、scopes 與該資源的權限 |
| 文件結果標示 partial | 檢查 warnings 與 completeness，不當成完整來源 |
| Startup port conflict | 停止舊 process，或修改 `PORT` 並更新 forwarding |
| 執行版本與預期不同 | 在部署環境核對 branch、commit、`package.json`，更新後 restart |

Logger 不會自動把 terminal output 存成檔案；需要保留時由 process manager 或 shell 收集。

已保存的 log files 可排程執行 `npm run logs:prune` 清理，預設目錄為 repository 的 `logs/`。選填的 `LOG_DIRECTORY` 必須位於專案內；pruning 不會自動執行。Webhook alerts 經遮蔽並以 60 秒去重，URL 不應包含 credentials。

## 驗證 Tests

執行 offline suite 與獨立的 knowledge-governance suite：

```sh
npm test
npm run test:knowledge-registry
```

feature branch 的 focused checks：

```sh
npm run test:official-mcp
npm run test:logging
npm run test:document-publication
npm run test:wiki-subtree:mcp
```

Offline tests 使用 fixtures，不需要 live Lark credentials。Live / remote tests 需對應 credentials、資源權限與 running endpoint，執行前先確認 script 的設定。Offline tests 通過不代表 deployed connector 或 tunnel 已驗證。

## 專案結構 Project layout

```text
runtime/             MCP servers、registrations、logging、lifecycle
integrations/lark/   Lark adapters、官方 MCP worker、governance logic
tools/lark/          對外 tool handlers
tests/               Unit / integration tests
scripts/             維運與驗證 utilities
docs/                現行說明與歷史紀錄
```

Request flow：**MCP transport → registration → tool → integration → Lark**。

## 延伸文件 References

- [Documentation index](docs/README.md)
- [Agent operating instructions](docs/operations/supermama-agent-instructions.md)
- [Official Lark MCP integration](docs/reference/official-lark-mcp.md)
- [Knowledge retrieval 與 external-web rules](docs/reference/knowledge-registry.md)
- [Wiki publication](docs/reference/document-publication.md)
- [Project structure](docs/architecture/project-structure.md)
- [Release history](docs/versions/CHANGELOG.md)

Release notes 與 reports 可能描述較早狀態；排查時以實際部署的 code、commit 與 configuration 為準。
