# Customer SRS & SOW — LINE OA ↔ Lark Suite CRM Bridge & Enterprise Architecture

Received from customer: 2026-08-22 (ICT)

This file preserves the customer-provided scope as a requirements source. Implementation status and engineering interpretation are tracked separately in `docs/customer-srs-gap-analysis.md`.

---

# 📋 เอกสารข้อกำหนดระบบและขอบเขตงาน (Software Requirements Specification & Scope of Work)

## โครงการ: ระบบเชื่อมต่อ LINE Official Account ↔ Lark Suite CRM Bridge & Enterprise Architecture

### 1. บทนำและวัตถุประสงค์โครงการ (Executive Summary & Project Objectives)

**วัตถุประสงค์:**

พัฒนาระบบ Omnichannel CRM Bridge เชื่อมต่อระหว่าง LINE Official Account (LINE OA) และ Lark Suite (Lark Messenger & Lark Base) แบบ 2-Way Real-time เพื่อให้ทีมขาย (Sales), ทีมสนับสนุนด้านเทคนิค (Tech Support) และผู้บริหาร สามารถบริหารจัดการลูกค้า, ส่งใบเสนอราคา, ออก QR Code พร้อมเพย์, ปิดการขาย, สรุปผลงาน SLA และยิงแคมเปญ Broadcast ได้อย่างครบวงจรผ่านหน้าต่าง Lark Messenger โดยที่ Sales ไม่ต้องเข้าใช้งานหน้าเว็บ LINE OA Manager หรือแก้ไขตาราง Lark Base โดยตรง

### 2. สถาปัตยกรรมระบบภาพรวม (System Architecture & Component Diagram)

ระบบประกอบด้วย 4 เลเยอร์หลัก:

1. Omnichannel Inbound/Outbound Layer: LINE Messaging API (Webhook & Push/Multicast API)
2. Reverse Proxy & Gateway Layer: Cloudflare Anycast Tunnel / NGINX Reverse Proxy (HTTPS / SSL Termination)
3. Bridge Core Server (Node.js / Go / Python):
   - Webhook Signature Verifier & In-flight Concurrency Lock
   - AI Sales Copilot Engine (NLP Intent & Lead Quality Analyzer)
   - Lark Interactive Card Schema 2.0 Generator & Patch Engine
   - 2-Way Media Sync Service (Images, PDFs, Audio, Location)
   - Smart Deal Extractor & PromptPay Thai QR Generator
   - CRM Multicast Promotion Broadcast Engine
4. Data & Analytics Layer: Lark Base (Bitable) Cloud Relational Database & Real-time Executive Dashboard

Customer-provided architecture image link:

`https://qsgjby8c2jgm.sg.larksuite.com/space/api/box/stream/download/asynccode/?code=M2VhMzkzNDMwNzQ2ZTg4MjkwNTYxYzEyNWUxZTM5MzhfcERSZUZpNkxTWG4zVGVxZEthOEthcVpqUThlQW9MS2VfVG9rZW46U3ZFTWJsYXEzb1lEdFp4N0pRTmxac1A4Z3FoXzE3ODczNjIyMDg6MTc4NzM2NTgwOF9WNA&add_watermark=true&scene_type=CCM`

### 3. รายละเอียดข้อกำหนดเชิงฟังก์ชัน (Detailed Functional Specifications - 7 Core Modules)

#### 🔹 โมดูลที่ 1: Inbound Omnichannel & Customer Identity Resolution

- 1.1 LINE Webhook Ingest: รองรับการรับ Webhook จาก LINE OA ตรวจสอบ Signature (HMAC-SHA256 ด้วย Channel Secret) และตอบกลับ HTTP 200 OK ทันที
- 1.2 In-flight Concurrency Lock: ระบบต้องมี Promise Lock (`userCreationLocks`) เพื่อป้องกัน Race Condition ในกรณีที่ลูกค้าส่งข้อความรัวๆ หลายข้อความในเสี้ยววินาที เพื่อรับประกันว่าจะมี Message Card หลักเพียง 1 ใบเท่านั้น
- 1.3 Customer Identity Sync: ตรวจสอบ `LINE_User_ID` ในตาราง Customers บน Lark Base หากเป็นลูกค้าใหม่ให้สร้าง Record และดึงชื่อ/รูปโปรไฟล์อัตโนมัติ หากเป็นลูกค้าเก่าให้อัปเดตประวัติ
- 1.4 Session & Chat Tracking: สร้าง Record ในตาราง `Chat_Tracking` เพื่อบันทึกเวลาที่ลูกค้าทักเข้ามา (`Customer_Msg_Time`) และตั้งสถานะเพื่อรอคำนวณ SLA

#### 🔹 โมดูลที่ 2: AI Sales Copilot (Intent Classification & Lead Scoring)

- 2.1 Intent Detection: วิเคราะห์เจตนาของลูกค้าจากข้อความ/รูปภาพแบบ Real-time:
  - 🎯 สนใจสั่งซื้อ (Buy Intent / Purchase Order)
  - 💰 สอบถามราคา / ขอใบเสนอราคา (Price Inquiry / Quotation Request)
  - 🔧 ปัญหาเชิงเทคนิค / นัดหมายเดโม่ (Technical Support / Demo Request)
  - 💬 สอบถามทั่วไป (General Inquiry)
- 2.2 Lead Quality Scoring: ติดแท็กสถานะลีด เช่น 🔥 Hot Lead, ⚡ High Intent, 🌱 New Lead
- 2.3 Actionable Guidance: สร้างคำแนะนำสั้นๆ ฝังลงในการ์ด Lark เพื่อแนะนำ Sales ในการเลือกกดปุ่ม Action ที่เหมาะสม

#### 🔹 โมดูลที่ 3: Lark Interactive Message Cards (Schema 2.0)

- 3.1 Dynamic Card Header:
  - สีฟ้า (blue): เคสใหม่ รอกดรับ (💬 [LINE Client] CustomerName)
  - สีเขียว (green): เคสมีเจ้าของดูแล (🟢 [LINE Client] CustomerName (ดูแลโดย: SalesName))
  - สีเทา (grey): เคสที่ปิดแล้ว (⚪ [LINE Client] CustomerName (ปิดเคสแล้ว) โดย SalesName)
- 3.2 Interactive Action Buttons:
  - [🙋♂️ รับเคสนี้]: Sales กดรับเคส เปลี่ยนสถานะเป็น Contacted และเปลี่ยนหัวการ์ดสด
  - [🎨 ส่งใบเสนอราคา (Flex)]: ยิงการ์ด LINE Flex Quotation เข้า LINE ลูกค้า 1-Click
  - [💳 ส่ง QR ชำระเงิน]: ยิงรูป PromptPay Thai QR เข้า LINE ลูกค้า
  - [💰 ปิดการขายสำเร็จ]: เปิด Prompt ให้ Sales พิมพ์ระบุยอดเงินใน Thread
  - [📢 ยิงโปร Re-target]: ส่งโปรโมชันส่วนลดพิเศษกระตุ้นปิดดีลเฉพาะราย
  - [✅ ปิดเคสนี้ (Resolved)]: จบเคส เคลียร์ Session และแปลงการ์ดเป็นรายงานสรุปผลงาน
- 3.3 Sub-Second Callback Architecture (<300ms):
  - ใน Event `card.action.trigger` ต้องตอบกลับ Payload ทันทีใน <300ms และแยกการอัปเดต Base หรือยิง LINE ออกไปทำงานเบื้องหลัง (Background Async) เพื่อป้องกันข้อผิดพลาด Lark 3.0s Timeout Error
- 3.4 Multi-Screen Live Sync: กำหนด config: `{ wide_screen_mode: true, update_multi: true }` เพื่อให้อัปเดตสดทุกหน้าจอของทีม

#### 🔹 โมดูลที่ 4: 2-Way Collaborative Chat & Strict Thread Security Guard

- 4.1 Team Collaboration in Thread: สมาชิกทุกคนในทีม Lark (Sales, Specialist, Manager) สามารถเข้ามาร่วมพิมพ์ตอบ, ส่งรูป, ส่ง PDF ใน Thread เดียวกันได้ และระบบจะส่งตรงเข้า LINE ลูกค้าอย่างถูกต้อง
- 4.2 Strict Root-Chat Isolation Guard (ความปลอดภัยสูงสุด):
  - หาก Sales พิมพ์ข้อความในช่องแชทรวมด้านล่าง (นอก Thread) ระบบต้องบล็อกไม่ให้ข้อความส่งไปที่ LINE ลูกค้าโดยเด็ดขาด 100% เพื่อป้องกันข้อความส่งผิดคน
  - ระบบจะส่งข้อความแจ้งเตือนสีส้มเตือน Sales ใน Lark ให้กดปุ่ม Reply in Thread แทน
- 4.3 2-Way Media Sync: รองรับการส่งและรับรูปภาพ (JPEG/PNG), ไฟล์เอกสาร (PDF), สติกเกอร์, พิกัดตำแหน่ง (GPS), ไฟล์เสียง

#### 🔹 โมดูลที่ 5: Smart Deal Closing & Thai QR Payment Engine

- 5.1 Smart Deal Regex Parser: ตรวจจับข้อความปิดยอดเงินของ Sales อัตโนมัติ เช่น `ปิดยอด 45000`, `ยอดเงิน 150000`, `30000`
- 5.2 Lark Base Deal Stamp: สร้าง Record ในตาราง `Sales_Deals` ระบุยอดเงินบาท, ชื่อ Sales ผู้ปิดดีล, เวลาปิดดีล, และตั้งสถานะเป็น Closed Won 🏆
- 5.3 Customer Stage Upgrade: เลื่อนขั้นลูกค้าในตาราง Customers เป็น 🏆 Active Customer และปรับระดับ VIP
- 5.4 Single Clean E-Receipt: ส่งข้อความยืนยันการรับชำระเงินเข้า LINE ลูกค้า โดยไม่ส่งรูป QR Code ซ้ำซ้อน

#### 🔹 โมดูลที่ 6: Post-Case Executive Analytics & SLA Metrics

- 6.1 Case SLA Calculation: คำนวณระยะเวลาตั้งแต่ลูกค้าทักเข้ามา (`Customer_Msg_Time`) จนถึงเวลาตอบกลับ (`Sales_Reply_Time`) แสดงเป็นนาที/วินาที พร้อมประเมิน 🟢 Fast Response (<=5m)
- 6.2 Sales Revenue Aggregation: ดึงยอดขายสะสมทั้งหมดของ Sales ผู้รับเคสจากตาราง `Sales_Deals` มารวมยอดเงินบาทและนับจำนวนดีลที่ปิดได้
- 6.3 Executive Card Mutation: เมื่อกดปุ่ม [✅ ปิดเคสนี้] การ์ดจะเปลี่ยนเป็นรายงานสรุป SLA และยอดขายสะสมของ Sales ทันที

#### 🔹 โมดูลที่ 7: CRM Segmented Broadcast (LINE Multicast Engine)

- 7.1 Customer Segmentation Query: ดึงกลุ่มลูกค้าเป้าหมายจาก Lark Base เช่น กลุ่ม VIP (`VIP_Status = 💎 Diamond`) หรือกลุ่มรอปิดการขาย (`Customer_Stage = 📄 Quotation Sent`)
- 7.2 LINE Multicast & Fallback Loop: ส่งการ์ดโปรโมชัน (LINE Flex Promotion) ผ่าน LINE Multicast API โดยมี Regex กรอง User ID แท้ (`/^U[0-9a-f]{32}$/`) พร้อม Fallback Loop ยิงตรงรายคน รับประกันอัตราการส่งถึง 100%
- 7.3 Lark Smart Command Dispatcher: Sales สามารถพิมพ์คำสั่งใน Lark Chat เพื่อยิงโปรโมชันได้ เช่น `ยิงโปร vip`, `ยิงโปร retarget`, `บรอดแคสต์`

### 4. โครงสร้างฐานข้อมูล Lark Base (Database Schema Specification)

#### ตารางที่ 1: Customers (ฐานข้อมูลลูกค้าและระดับ VIP)

- `Customer_ID` (Text / Primary ID)
- `Name` (Text - ชื่อลูกค้า)
- `LINE_User_ID` (Text - Unique LINE User ID)
- `Customer_Stage` (Single Select: 🌱 New Lead, 💬 Contacted, 📄 Quotation Sent, 🏆 Active Customer, 💤 Inactive)
- `VIP_Status` (Single Select: Standard, 🥇 Gold VIP, 💎 Diamond VIP)
- `Total_Spend_THB` (Currency / Rollup ยอดใช้จ่ายรวม)
- `Chat_History` (Link to Chat_Tracking)
- `Deals` (Link to Sales_Deals)

#### ตารางที่ 2: Chat_Tracking (บันทึกประวัติการแชท & สถิติ SLA)

- `Tracking_ID` (Text / Auto UUID)
- `Customer` (Link to Customers)
- `Customer_Msg_Time` (DateTime / Epoch Timestamp)
- `Sales_Reply_Time` (DateTime / Epoch Timestamp)
- `Assigned_Sales` (Text / User Name)
- `AI_Intent` (Single Select: Buy Intent, Price Inquiry, Support)
- `Lead_Quality` (Single Select: 🔥 Hot Lead, ⚡ High Intent, 🌱 New Lead)
- `Channel` (Single Select: 🟢 LINE Official Account)
- `SLA_Minutes` (Formula: `ROUND((Sales_Reply_Time - Customer_Msg_Time) / 60000, 1)`)
- `SLA_Status` (Formula: `IF(SLA_Minutes <= 5, "🟢 Fast (<5m)", "🔴 Overdue SLA")`)

#### ตารางที่ 3: Sales_Deals (บันทึกยอดขายและดีลที่ปิดสำเร็จ)

- `Deal_ID` (Text / Auto ID เช่น DEAL-XXXX)
- `Customer` (Link to Customers)
- `Deal_Value_THB` (Currency THB)
- `Sales_Rep` (Text / User Name)
- `Deal_Status` (Single Select: Open, Closed Won 🏆, Closed Lost)
- `Pipeline_Stage` (Single Select: Lead, Quotation, Payment Received, Closed Won)
- `Closed_At` (DateTime / Epoch Timestamp)

### 5. ข้อกำหนดด้านความปลอดภัยและความเสถียร (Security, Reliability & NFR)

1. Crash Guard & Self-Healing:
   - ดักจับ `uncaughtException` และ `unhandledRejection` ไม่ให้ Process หยุดทำงาน
   - Lark WebSocket Auto-Reconnection เมื่อสัญญาณอินเทอร์เน็ตสะดุด
2. 3-Tier Logging Architecture:
   - `logs/error.log`: บันทึก Error พร้อม Stack Trace สำหรับ Debug
   - `logs/combined.log`: บันทึก Request/Response และ Event ทั้งหมด
   - Lark Base Audit Trail: บันทึกประวัติธุรกรรมระดับธุรกิจถาวร
3. Data Security & Privacy:
   - รองรับการเข้ารหัส Token และ Environment Variables ผ่าน `.env`
   - ป้องกันการรั่วไหลของข้อมูลระหว่างลูกค้าด้วย Thread-Only Isolation Guard
