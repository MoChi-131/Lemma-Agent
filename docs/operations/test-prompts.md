# ChatGPT Acceptance Prompts

Use each prompt in a new ChatGPT conversation with the Supermama MCP connector enabled. These are end-to-end checks for the agent's visible behaviour. They do not replace automated tests.

An **oracle** is the observable result that determines whether a test passes. Do not require an exact wording or a fixed factual answer when the underlying Lark or government content may change.

## Before testing

1. Start the current MCP server with `npm.cmd run mcp:http`.
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
- Inspects returned image or whiteboard evidence when it is available.
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

## Record results

For every run, record the date, prompt number, pass/fail, response link or transcript, MCP server version, and any connector or Lark permission error. A failed connector call is an infrastructure failure; it does not prove that source content is invalid.
