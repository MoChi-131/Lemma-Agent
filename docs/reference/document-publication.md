# 批准後儲存 Wiki 文件

同事提供要求或上傳資料 → Agent 起草並建議位置 → 同事批准最後版本 → 新增文件並讀回確認。

## 設定

```dotenv
LARK_DOCUMENT_WIKI_ROOT_URL=https://your-tenant.larksuite.com/wiki/ROOT_TOKEN
ENABLE_LARK_DOCUMENT_WRITES=true
```

沿用現有 Lark App credentials。目標須是上述 Wiki 根頁或其下的既有原始節點；應用程式須能讀取路徑、列出子頁、新增子頁及讀寫新文件。配置只允許寫入功能，個別文件仍須先取得人手批准。更新後重啟 MCP server，並刷新 connector 以取得新增工具。

## 工具

| 工具 | 用途 |
| --- | --- |
| `prepare_knowledge_document` | 接收完整 Markdown、標題、父頁及位置理由；檢查格式與同名文件，返回審閱稿。不提供父頁時先返回可選位置。 |
| `publish_approved_document` | 使用已批准草稿的內部參照新增 Wiki 文件並寫入正文，立即讀回驗證。 |
| `inspect_document_publication` | 使用原參照唯讀檢查結果；不重新建立或補寫。 |

支援文字、標題、清單、引用、程式碼、Markdown 連結及普通表格；上限 100 KB Markdown、1000 個內容區塊。不支援圖片或原始附件上傳、合併表格、覆蓋／移動／刪除既有文件。原始上傳檔由 ChatGPT 的可用檔案能力先讀取，整理後交給準備工具。Metadata 由另一個定期流程處理。

## 實作及確認

準備時將 Markdown 轉成 Lark 原生區塊並檢查完整父子關係；批准的是該標題、正文及 Wiki 路徑。儲存前再次檢查路徑和同名文件。讀回比較文字、連結、基本文字格式、清單層級及表格格數與每格正文；不比較 Lark 自動生成的 ID、預設樣式或表格欄寬。此確認只證明文件寫入一致，不代表已核實來源事實或完成 metadata 登記。

使用原生 [Wiki node create](https://open.larksuite.com/document/server-docs/docs/wiki-v2/space-node/create)、[Markdown convert](https://open.larksuite.com/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document/convert) 及 [nested block creation](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/docx/v1/resource.go) API。單次新增嵌套區塊保存文字和表格；不呼叫 Base API。

## 中斷或失敗

草稿及寫入階段存於專案的 `.lemma-drafts/`，已排除 Git。請保留這個私有目錄，避免重啟後失去寫入紀錄；使用同一持久目錄的單個部署，不支援分散式多台 server 協作。

工具先保存階段才送出寫入；逾時或錯誤不會自動重試。若已取得新文件連結，就讀回該文件；只有內容、標題及位置全部一致才回報成功。若建立回應遺失，需先檢查父頁並由維護者處理不明結果，工具不會把同名頁直接當作本次新文件。部分建立的頁面不會自動刪除或補寫。

程序突然中斷可能留下 `publication.lock`。維護者先停止所有 writer、以唯讀工具／Wiki 檢查原操作並保留 receipt，確認沒有仍在執行的請求後才移除該鎖；移除鎖不會重設 receipt 或允許盲目重播。不要刪除整個草稿目錄來重試。

離線檢查：`npm run test:document-publication`。實際驗收使用 [測試 prompts](../operations/test-prompts.md) 的文件儲存案例。
