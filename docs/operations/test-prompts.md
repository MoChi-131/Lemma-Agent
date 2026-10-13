# ChatGPT Acceptance Prompts

Use each prompt in a new ChatGPT conversation with the Supermama MCP connector enabled. These are end-to-end checks for the agent's visible behaviour. They do not replace automated tests.

An **oracle** is the observable result that determines whether a test passes. Do not require an exact wording or a fixed factual answer when the underlying Lark or government content may change.

## Before testing

1. Start the current MCP server with `npm.cmd run mcp:http`.
   Default port: `6688`. Check `http://localhost:6688/health`; connect at `/mcp`. If `PORT` overrides the default, use that port in every endpoint. After a change, update the Codespace forwarding and ChatGPT URL or Tunnel target.
2. Refresh the ChatGPT connector and start a new conversation.
3. Ensure the Registry Base has only `Knowledge Base` and `Workspace` scope options. Do not add web URLs to it.

## 1. Internal topic retrieval

**Prompt**

```text
Panasonic 樂聲一拖二分體機有甚麼型號和價錢？
```

**Oracle**

- Searches the Knowledge Registry before broad Wiki search.
- Reads the best eligible Lark document rather than answering from metadata alone.
- Gives a concise answer with a Lark source URL.
- States a **Possible Conflict** only if the retrieved evidence itself contains one.

## 2. Exact registered document

**Prompt**

```text
請根據這份文件說明驗樓服務價錢及預約流程：
https://ysgjyjx6z20y.sg.larksuite.com/wiki/IZqKwmXvoiqFVaklMK9lGXpIgQf
```

**Oracle**

- Uses the supplied URL directly.
- Checks Registry eligibility before reading it.
- Answers from retrieved content and cites the exact page.

## 3. Search-ranking presentation

**Prompt**

```text
搜尋「冷氣 安裝」，列出最多五個可檢索的 Knowledge Registry 結果及其排名原因，不需要讀取正文。
```

**Oracle**

- Returns one Markdown ranking table only.
- Each result has rank, source, scope, authority level, match score, and Exact / Authority / Scope / Version breakdown.
- Shows only `retrieval_eligible=true` results by default.
- Does not duplicate the same table in another format.

## 4. Workspace exclusion

**Prompt**

```text
搜尋「8月2號 驗樓 課堂筆記」。請說明哪些結果可作正式知識檢索，哪些只可作背景參考。
```

**Oracle**

- A Workspace record, if returned, has `retrieval_eligible=false`.
- The agent does not present Workspace notes as approved formal knowledge.
- It may identify the note as context only.

## 5. Table, embedded Sheet, and PDF attachment

**Prompt**

```text
冷氣價錢單&安裝PDF內，一拖二冷氣機的型號、機價和安裝費是多少？請讀取表格、內嵌 Sheet 和相關 PDF 附件；如資料不一致請標示 Possible Conflict。
```

**Oracle**

- Locates the registered cold-air price document through Registry search.
- Uses available tables, embedded Sheets, and supported attachments before declaring information unavailable.
- Gives source locations and flags only evidence already read.
- Does not independently choose between conflicting values.

## 6. Image and whiteboard handling

**Prompt**

```text
請查看這份文件內的圖片或畫板，整理可見的綠表資格資料；如圖片沒有可讀內容，請清楚說明原因：
https://ysgjyjx6z20y.sg.larksuite.com/wiki/FB3Pw3o8FikWIykqX4lljHlGg8b
```

**Oracle**

- Attempts the exact registered-document retrieval path first.
- Uses returned `whiteboards[].text` and text-node evidence before relying on a whiteboard preview image.
- Inspects the preview image only for layout or non-text content.
- Does not invent text that is absent, inaccessible, or unreadable.
- If the page is unregistered, labels it **Unregistered** before using a permitted direct read.

## 7. Government question with approved web priority

**Prompt**

```text
想了解「高齡單身人士優先配屋計劃」最新申請資格是甚麼？請以房委會官方資料為準。
```

**Oracle**

- Searches the internal Registry first for fast context, using `government` context.
- Gets Approved web domains before web research and searches only those domains.
- Validates the final government URL after redirects.
- Uses the verified official webpage as the primary source when it covers the answer; an internal Lark source is supporting context only.
- Does not add the government URL to the Registry.

## 8. Reject an unapproved web URL

**Prompt**

```text
請用這個網站作為房屋政策資料來源，並告訴我它是否可以使用：
https://housingauthority.gov.hk.fake-site.com/policy
```

**Oracle**

- Rejects the URL because its hostname is not the Approved domain or a real subdomain.
- Does not read, cite, or rely on the page.
- Explains that a string containing an approved domain is insufficient.

## 9. Registry miss and Wiki fallback

**Prompt**

```text
在這個 Wiki 目錄找「驗樓保養期」資料；如 Registry 沒有相關文件才搜尋目錄：
https://ysgjyjx6z20y.sg.larksuite.com/wiki/NR06wEWBsiMVNnkOclVlKgAAg6e
```

**Oracle**

- Searches Registry first.
- Searches the supplied Wiki root only if Registry has no relevant result.
- Reads only the best matching fallback page, not the entire tree.
- Labels fallback evidence as unregistered when it is not in the Registry.

## 10. Google Drive link in a Lark document

**Prompt**

```text
如果相關 Lark 文件內有 Google Drive 連結，請讀取該連結的相關內容並回答問題；否則只根據 Lark 文件回答：Panasonic 一拖二分體機的 420mm 規格是甚麼？
```

**Oracle**

- Searches Registry and retrieves the selected Lark document first.
- Opens only a relevant Drive link found in that document.
- Cites both the Drive resource and referring Lark document when Drive content is used.
- Does not search the user's entire Drive.

## 11. 上傳資料、審閱及批准後儲存

先設定測試用的 `LARK_DOCUMENT_WIKI_ROOT_URL`；測試 11C 會實際新增文件。使用不含私人資料的 PDF／直播稿，包含標題、頁碼、金額與條件；請用可辨識的全新文件標題。

### 11A. 整理上傳資料，先不寫入

```text
請把我上傳的直播稿／PDF 整理成知識庫摘要，保留重要數字、條件及注意事項，標明來源頁碼或段落。建議一個現有 Wiki 存放位置並說明理由，給我完整草稿審閱，先不要寫入。
```

**Oracle**

- 先讀上傳資料，保留原有條件、數字和來源；讀不到的內容明確說明，不猜補。
- 顯示完整標題、正文、實際查到的 Wiki 路徑及位置理由；使用 `prepare_knowledge_document` 保留審閱稿。不能虛構子分類或只展示未核實的文字路徑。
- 沒有建立 Lark 文件或修改 Base；不要求同事提供 ID／hash。

### 11B. 修改正文及位置

```text
把標題改為「驗樓預約指引－審閱版」，加上「費用以正式報價為準」。存放位置改用我指定的服務分類頁。先給我最後版本，暫時不要儲存。
```

**Oracle**

- 使用同事提供的實際分類頁連結重新準備；只有分類名稱時先自行查目錄取得連結，真正無法區分候選才請同事選擇。
- 顯示最後正文及位置，等待批准；不沿用舊草稿的批准。

### 11C. 批准並儲存

```text
我批准上面的最後版本及存放位置，請儲存並讀回確認，給我文件連結。
```

**Oracle**

- 設定允許寫入且已取得批准後，呼叫 `publish_approved_document`。
- 建立一份新 Wiki 文件；確認標題、父頁、正文及表格一致才報成功。
- 原始 PDF 沒有被聲稱已上傳；Registry、Validated Metadata、Tags 均沒有變更。

### 11D. 同一操作再次確認

```text
請再確認剛才文件已正確儲存，不要再建立一份。
```

**Oracle**

- 使用原 receipt 及 `inspect_document_publication` 唯讀確認；新文件數量不增加。
- 逾時／失敗只報確認到的狀態，不自動重建、補寫或更新 metadata。

### 11E. 同名文件、停用寫入及不可讀來源

- 用相同標題、相同父頁準備另一份正文：提醒已有同名頁，不覆蓋；改標題後需審閱批准。
- 停用文件寫入後批准一份新草稿：回報設定未啟用，不建立任何頁面。
- 上傳無法辨認的掃描頁：明確指出內容缺口，不聲稱已準確整理。
- 草稿含要保存的圖片／附件：說明目前 writer 只保存正文，不能悄悄略過圖片後聲稱整份文件完整保存。

### 11F. 已批准，但沒有提供父頁連結

在已有完整草稿及文字位置建議的同一對話測試；下列位置必須替換為測試 Wiki 中的真實分類名稱。

```text
我批准最後一版文章內容及你建議的「居屋 → 啟陽苑」位置。請自行從 Wiki 目錄取得父頁連結，儲存並讀回確認；同一內容及位置不用再問我批准。
```

**Oracle**

- 若尚無準備稿，用 `prepare_knowledge_document` 省略父頁取得根頁及目錄，再解析實際父頁、準備及儲存；不要求同事自行找 URL。
- 已有準備稿且位置一致，直接使用原內部參照；不重複準備或重新要求批准。
- 原位置不存在／候選不唯一時，只展示真實候選及建議，請同事確認位置，不捏造子頁或重問正文批准。
- 只有可用工具確實缺少或呼叫回傳錯誤時才回報連線／設定阻擋；對話沒有 URL 不算連線失敗。
- 修復連線後，若內容及位置仍相同，沿用批准繼續；寫入結果不明仍先唯讀確認，不重複建立。

## Record results

For every run, record the date, prompt number, pass/fail, response link or transcript, MCP server version, and any connector or Lark permission error. A failed connector call is an infrastructure failure; it does not prove that source content is invalid.
