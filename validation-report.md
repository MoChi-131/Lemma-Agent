# Knowledge Registry Validation Report
Generated: 2026-09-17T07:59:53.658Z
Total Records: 13
Skipped Empty Rows: 0
Validation Mode: Schema Freeze v1.0 checks (required fields + Scope-specific enums)

---

## Summary of Validation Issues

**Overall: 10 VALID | 3 INVALID (77% valid)**

### Validation Statistics by Scope

- **Workspace**: 2/3 valid (67%)
- **Knowledge Base**: 6/7 valid (86%)
- **External Reference**: 2/3 valid (67%)

### Missing Required Fields Summary

- `status`: missing in 1 record
- `primary_domain`: missing in 1 record
- `document_type`: missing in 1 record
- `source_url`: missing in 1 record
- `source_domain`: missing in 1 record
- `authority_level`: missing in 1 record

### Invalid Records Requiring Changes

#### 1. **rec28bJVlAF9Hc** - "8月2號驗樓課堂筆記 - Version2"
- **Scope**: Workspace
- **Action**: Change Approved Date to today or an earlier date. Current value 2026-09-22; expected on or before 2026-09-17.

#### 2. **recvvh1ixPYU9d** - "居屋基本樓宇知識"
- **Scope**: Knowledge Base
- **Missing Required Fields**: 1
  - `status`
- **Action**: Add required field: status.

#### 3. **recvvh1ixPIGPd** - "出售綠表置居計劃單位2025"
- **Scope**: External Reference
- **Missing Required Fields**: 5
  - `primary_domain`
  - `document_type`
  - `source_url`
  - `source_domain`
  - `authority_level`
- **Action**: Add required fields: primary_domain, document_type, source_url, source_domain, authority_level.

### Valid Records

1. **rec28bJVlAF9gn** - "8月2號驗樓課堂筆記" (Workspace)
2. **rec28bJVlAFabV** - "9.19實體班" (Workspace)
3. **rec28bJVlAFaDU** - "驗樓SOP" (Knowledge Base)
4. **recvvh1ixPKXpc** - "叻媽驗樓團隊介紹&slogan&服務宗旨" (Knowledge Base)
5. **recvvh1ixPeU6x** - "驗樓服務價錢及預約&服務流程" (Knowledge Base)
6. **recvvh1ixPeLTf** - "驗樓出現問題整理" (Knowledge Base)
7. **recvvh1ixPsPN1** - "冷氣機知識整理 & 型號對比介紹" (Knowledge Base)
8. **recvvh1ixPMm4W** - "冷氣機常見 Q&A" (Knowledge Base)
9. **recvvh328F5uU9** - "樓宇結構安全保證（居屋／綠置居）" (External Reference)
10. **recvvrAfUT2pir** - "裝修佬" (External Reference)

---

## Detailed Validation Report

## Record: rec28bJVlAF9gn
Title: 8月2號驗樓課堂筆記
Scope: Workspace

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Workspace"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Service"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "Meeting Notes | Analysis | Research | Planning | Campaign | Architecture | Design | Development Doc | Test Doc | Project Doc | Report"
  - Actual: "Meeting Notes"
  - Evidence: Valid for Workspace

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-13"
  - Evidence: Approved Date 2026-09-13 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 5
- Checks Failed: 0
- Warnings: 0

---

## Record: rec28bJVlAF9Hc
Title: 8月2號驗樓課堂筆記 - Version2
Scope: Workspace

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Workspace"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Service"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "Meeting Notes | Analysis | Research | Planning | Campaign | Architecture | Design | Development Doc | Test Doc | Project Doc | Report"
  - Actual: "Meeting Notes"
  - Evidence: Valid for Workspace

**approved_date_not_future**: FAIL
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-22"
  - Evidence: Approved Date 2026-09-22 is later than today (2026-09-17)

### Summary
- Overall Status: INVALID
- Retrieval Eligible: false
- Checks Passed: 4
- Checks Failed: 1
- Warnings: 0

---

## Record: rec28bJVlAFabV
Title: 9.19實體班
Scope: Workspace

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Workspace"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Operation"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "Meeting Notes | Analysis | Research | Planning | Campaign | Architecture | Design | Development Doc | Test Doc | Project Doc | Report"
  - Actual: "Planning"
  - Evidence: Valid for Workspace

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-06"
  - Evidence: Approved Date 2026-09-06 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 5
- Checks Failed: 0
- Warnings: 0

---

## Record: rec28bJVlAFaDU
Title: 驗樓SOP
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Service"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "SOP"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Draft"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Internal Official"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2021-09-08"
  - Evidence: Approved Date 2021-09-08 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPKXpc
Title: 叻媽驗樓團隊介紹&slogan&服務宗旨
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Company"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "Service Info"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Review"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Reference"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-16"
  - Evidence: Approved Date 2026-09-16 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPeU6x
Title: 驗樓服務價錢及預約&服務流程
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Service"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "Pricing"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Approved"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Internal Official"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-17"
  - Evidence: Approved Date 2026-09-17 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: true
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPYU9d
Title: 居屋基本樓宇知識
Scope: Knowledge Base

### Validation Checks

**required_fields**: FAIL
  - Expected: "no missing required fields"
  - Actual: "1 missing"
  - Evidence: status

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Property"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "Knowledge Article"
  - Evidence: Valid for Knowledge Base

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Internal Official"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-09-15"
  - Evidence: Approved Date 2026-09-15 is not in the future

### Missing Required Fields
- status

### Summary
- Overall Status: INVALID
- Retrieval Eligible: false
- Checks Passed: 5
- Checks Failed: 1
- Warnings: 0

---

## Record: recvvh1ixPeLTf
Title: 驗樓出現問題整理
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Service"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "Knowledge Article"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Approved"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Reference"
  - Evidence: Valid enum value

### Summary
- Overall Status: VALID
- Retrieval Eligible: true
- Checks Passed: 6
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPsPN1
Title: 冷氣機知識整理 & 型號對比介紹
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Product"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "Product Spec"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Draft"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Reference"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-04-08"
  - Evidence: Approved Date 2026-04-08 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPMm4W
Title: 冷氣機常見 Q&A
Scope: Knowledge Base

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "Knowledge Base"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Product"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "SOP | FAQ | Pricing | Policy | Guide | Product Spec | Service Info | Official Notice | Knowledge Article | Reference | Template"
  - Actual: "FAQ"
  - Evidence: Valid for Knowledge Base

**status_value**: PASS
  - Expected: "Draft | Review | Approved | Archived"
  - Actual: "Review"
  - Evidence: Valid enum value

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Internal Official"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-04-08"
  - Evidence: Approved Date 2026-04-08 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvh1ixPIGPd
Title: 出售綠表置居計劃單位2025
Scope: External Reference

### Validation Checks

**required_fields**: FAIL
  - Expected: "no missing required fields"
  - Actual: "5 missing"
  - Evidence: primary_domain, document_type, source_url, source_domain, authority_level

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "External Reference"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-04-08"
  - Evidence: Approved Date 2026-04-08 is not in the future

### Missing Required Fields
- primary_domain
- document_type
- source_url
- source_domain
- authority_level

### Summary
- Overall Status: INVALID
- Retrieval Eligible: false
- Checks Passed: 2
- Checks Failed: 1
- Warnings: 0

---

## Record: recvvh328F5uU9
Title: 樓宇結構安全保證（居屋／綠置居）
Scope: External Reference

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "External Reference"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Property"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "Official Notice | Policy | Guide | Reference"
  - Actual: "Guide"
  - Evidence: Valid for External Reference

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "External Official"
  - Evidence: Valid enum value

**whitelist_status_value**: PASS
  - Expected: "Pending | Approved | Suspended | Rejected"
  - Actual: "Approved"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-04-08"
  - Evidence: Approved Date 2026-04-08 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: true
- Checks Passed: 7
- Checks Failed: 0
- Warnings: 0

---

## Record: recvvrAfUT2pir
Title: 裝修佬
Scope: External Reference

### Validation Checks

**required_fields**: PASS
  - Expected: "no missing required fields"
  - Actual: "complete"
  - Evidence: All required fields present

**scope_value**: PASS
  - Expected: "Knowledge Base | Workspace | External Reference"
  - Actual: "External Reference"
  - Evidence: Valid enum value

**primary_domain_value**: PASS
  - Expected: "Service | Property | Product | Customer | Marketing | Operation | IT | Company | Sales"
  - Actual: "Company"
  - Evidence: Valid enum value

**document_type_value**: PASS
  - Expected: "Official Notice | Policy | Guide | Reference"
  - Actual: "Reference"
  - Evidence: Valid for External Reference

**authority_level_value**: PASS
  - Expected: "Internal Official | External Official | Reference | Unverified"
  - Actual: "Reference"
  - Evidence: Valid enum value

**approved_date_not_future**: PASS
  - Expected: "on or before 2026-09-17"
  - Actual: "2026-04-08"
  - Evidence: Approved Date 2026-04-08 is not in the future

### Summary
- Overall Status: VALID
- Retrieval Eligible: false
- Checks Passed: 6
- Checks Failed: 0
- Warnings: 0

---
