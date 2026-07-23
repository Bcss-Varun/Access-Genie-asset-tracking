# 5. Complete Feature Matrix (300+ Features)

Organized by module. Each feature is tagged with a suggested **phase** (P1–P5, see roadmap) and priority
(●●● must / ●● should / ● could). This is the master backlog; it doubles as a sales feature-comparison sheet.

> Count check: 20 modules × ~16 features ≈ **320+ features**.

---

## M1 · Asset Registry & Master Data
1. Central asset registry with unlimited custom attributes ●●● P1
2. Configurable asset taxonomy / class hierarchy ●●● P1
3. Per-class attribute templates (dynamic forms) ●●● P1
4. Global unique Asset ID + human-friendly tag ●●● P1
5. Parent/child & component (sub-asset) relationships ●●● P1
6. Asset kits/bundles & fleets (group operations) ●● P1
7. Bulk import (CSV/Excel/API) with validation & dry-run ●●● P1
8. Bulk edit / bulk actions with undo ●● P1
9. Label/tag printing (QR/barcode/RFID encoding) ●●● P1
10. Duplicate & ghost-asset detection (AI) ●● P3
11. Data-quality scoring & completeness prompts ●● P2
12. Asset cloning / templates for fast onboarding ●● P1
13. Custom fields with validation, units, pick-lists ●●● P1
14. Attachments (docs, images, manuals, CAD) per asset ●●● P1
15. Multi-language asset names/descriptions ● P4
16. Soft-delete + restore + merge assets ●● P1
17. Saved views & shareable filtered lists ●● P1
18. Asset barcode/QR/NFC lookup (scan-to-open) ●●● P2

## M2 · Tracking, RTLS & IoT
19. Real-time location (indoor RTLS) ●●● P2
20. Outdoor GPS/GNSS tracking ●●● P2
21. Multi-tech ingestion: RFID/BLE/UWB/GPS/LoRaWAN/WiFi/NFC ●●● P2
22. Live map with clustering & layer toggles ●●● P2
23. Digital Twin 2D/3D facility model ●● P4
24. Geofence creation (draw/import) & breach alerts ●●● P2
25. Zone dwell-time & occupancy analytics ●● P3
26. Movement history trails & replay ●● P2
27. Movement heatmaps & flow analysis ●● P3
28. Indoor wayfinding / find-my-asset (AR-ready) ● P5
29. Proximity & contact tracing (asset-to-asset/person) ● P3
30. Last-seen / signal-loss detection & alerts ●●● P2
31. Location confidence & sensor-fusion accuracy ●● P3
32. Battery/health monitoring for tags & sensors ●●● P2
33. Gateway/reader fleet management & config ●●● P2
34. Sensor calibration & firmware OTA updates ●● P3
35. Telemetry explorer (time-series query & charts) ●● P2
36. Edge-computing rules (local alerting) ● P5
37. Camera-vision / video analytics asset detection ● P5
38. Environmental monitoring (temp/humidity/shock/vibration) ●● P2

## M3 · AI & Intelligence
39. Asset Health Score (0–100, explainable) ●●● P3
40. Predictive maintenance / failure forecasting ●●● P3
41. Remaining Useful Life (RUL) estimation ●● P3
42. Anomaly detection (behavioral/telemetry) ●●● P3
43. Idle / underutilized asset detection ●●● P3
44. Overutilization & overload detection ●● P3
45. Theft / loss / tamper prediction ●●● P3
46. Risk scoring (composite) & risk drivers ●●● P3
47. Cost-optimization recommendations ●● P3
48. Utilization analytics & rebalancing suggestions ●●● P3
49. Lifecycle & EOL prediction ●● P3
50. Replacement recommendation engine ●● P3
51. Capacity & demand planning / forecasting ●● P4
52. Digital-twin simulation & what-if ● P4
53. AI Copilot (agentic actions across modules) ●●● P4
54. Natural-language search & query ●●● P3
55. Generative reports & narratives ●● P4
56. AI chat assistant (per-asset & global) ●● P4
57. Recommendation feed (ranked, $-impact) ●●● P3
58. Explainability (drivers, confidence, counterfactuals) ●●● P3
59. Model registry, versioning & drift monitoring ●●● P3
60. Feedback loop (human-in-the-loop learning) ●● P3
61. Auto-tagging / classification from images ● P5

## M4 · Maintenance (EAM)
62. Work order management (create/assign/track/close) ●●● P1
63. Preventive maintenance (PM) scheduling (time/usage) ●●● P1
64. Predictive WOs auto-generated from AI ●●● P3
65. Corrective/breakdown WOs ●●● P1
66. WO board (Kanban), list & calendar views ●●● P1
67. Technician scheduling & load balancing ●● P2
68. Mobile WO execution (offline) ●●● P2
69. Digital inspection checklists & forms ●●● P2
70. Failure codes & problem/cause/remedy taxonomy ●● P1
71. Parts/BOM linkage to WOs ●● P1
72. Labor & time tracking per WO ●● P1
73. SLA & escalation on WOs ●● P2
74. Warranty-aware maintenance (claim vs. repair) ●● P2
75. Meter/usage-based triggers ●● P2
76. Maintenance history & asset service log ●●● P1
77. MTTR/MTBF & reliability analytics ●● P2
78. Safety/LOTO & permit-to-work ● P3
79. Vendor/contractor WO assignment & portal ●● P2

## M5 · Inventory & Parts
80. Spare parts & consumables catalog ●● P1
81. Stock levels by warehouse/bin ●● P1
82. Reorder points & auto-reorder rules ●● P2
83. Purchase orders & receiving ●● P2
84. ABC analysis & inventory valuation ●● P2
85. Parts issue/return to WOs ●● P1
86. Cycle counts & stock adjustments ●● P2
87. Supplier/vendor catalog & lead times ●● P2
88. Kitting & staging for planned work ● P3
89. Barcode/RFID-driven receiving & picking ●● P2
90. Consignment & min/max by location ● P3
91. AI demand forecast & optimal stock ●● P4
92. Serialized vs. non-serialized parts ●● P1
93. Stockout & shortage alerts ●● P2

## M6 · Operations & Custody
94. Check-in / check-out (custody) ●●● P1
95. Reservations & booking of shared assets ●● P2
96. Transfer requests & approvals (SoD) ●●● P1
97. Inter-facility movement tracking ●● P2
98. Chain-of-custody logging (immutable) ●●● P1
99. Reservation calendar & conflict handling ●● P2
100. Self-service kiosk check-out ● P3
101. Asset request & fulfillment workflow ●● P2
102. Loan/rental & return-due reminders ●● P2
103. Custody dispute & reconciliation ● P3

## M7 · Lifecycle & Disposal
104. Procurement & PO-to-asset onboarding ●● P1
105. Commissioning & staging workflow ●● P1
106. Lifecycle stage board (Kanban) ●● P1
107. Depreciation schedules (multiple methods) ●● P2
108. End-of-life forecasting ●● P3
109. Retirement/decommission workflow ●● P1
110. Disposal (sell/scrap/donate/recycle) & certificates ●● P1
111. Replacement planning & capex tie-in ●● P3
112. Refurbish/redeploy workflow ● P3
113. Warranty & lease lifecycle tracking ●● P1

## M8 · Financials
114. Capitalization & book value ●● P2
115. Depreciation engine (SL, DB, units-of-prod) ●● P2
116. Total Cost of Ownership (TCO) rollup ●● P2
117. Cost centers & GL account mapping ●● P2
118. Capex/opex tracking & forecasting ●● P3
119. Write-off & impairment workflow ●● P2
120. Cost-per-operating-hour / cost-per-use ●● P3
121. Budget vs. actual by department ●● P3
122. ERP/GL sync (SAP/Oracle/Dynamics/NetSuite) ●● P2
123. Insurance & valuation tracking ● P3
124. Lease vs. buy analysis (AI) ● P4

## M9 · Alerts & Notifications
125. Unified alert center (all event types) ●●● P1
126. Real-time push/email/SMS/in-app/Slack/Teams ●●● P2
127. Alert rules engine (condition builder) ●●● P2
128. Severity, ack, snooze, escalate workflow ●●● P2
129. Escalation policies & on-call routing ●● P2
130. Notification preferences & digests ●● P1
131. Geofence/tamper/anomaly alerts ●●● P2
132. Threshold & telemetry alerts ●● P2
133. Alert deduplication & correlation ●● P3
134. Alert analytics (volume, response, false-positive) ●● P2

## M10 · Analytics, Reporting & BI
135. Prebuilt report library (per module/persona) ●●● P1
136. Custom report builder (drag-drop) ●● P2
137. Ad-hoc BI explorer (pivot, charts) ●● P3
138. Scheduled reports & subscriptions ●● P2
139. Export PDF/Excel/CSV/PNG ●●● P1
140. Executive/board report generation (AI) ●● P4
141. Financial & depreciation reports ●● P2
142. Utilization & performance reports ●● P2
143. Compliance & audit reports ●●● P2
144. Custom dashboards & KPI targets ●● P2
145. Embedded/white-label analytics (signed URLs) ● P4
146. Benchmarking (cross-facility/industry) ● P4

## M11 · Compliance & Audit
147. Physical audit & cycle-count workflow ●●● P2
148. Mobile audit (scan-to-verify) ●●● P2
149. Chain-of-custody & evidence trail ●●● P1
150. Immutable audit log (all system actions) ●●● P1
151. Certification & calibration expiry tracking ●● P2
152. Warranty compliance & recall management ●● P2
153. Regulatory templates (HIPAA/Joint Commission/etc.) ●● P3
154. Data retention & legal hold ●● P2
155. GDPR/CCPA data subject tools ●● P2
156. One-click audit/evidence pack export ●● P2
157. Segregation-of-duties enforcement ●● P1

## M12 · Administration & Configuration
158. Organization/facility/zone structure editor ●●● P1
159. User & role management (RBAC) ●●● P1
160. Custom roles & permission sets ●● P1
161. Teams, departments & cost centers ●● P1
162. Approval workflow builder ●● P2
163. Business-rules / automation engine (no-code) ●● P3
164. Custom fields & forms designer ●● P1
165. Localization (language, units, currency, timezone) ●● P2
166. Branding / white-label theming ●● P2
167. Feature flags & module toggles ●● P1
168. Data import/export & tenant backup ●● P1
169. Billing, plan & usage management ●● P2
170. SSO/SCIM user provisioning ●● P2

## M13 · Integrations & Platform
171. REST + GraphQL public API ●●● P1
172. Webhooks & event subscriptions ●●● P2
173. Streaming API (WebSocket/SSE) for live data ●● P2
174. IoT gateway/adapter SDK (vendor-neutral) ●●● P2
175. ERP connectors (SAP/Oracle/Dynamics/NetSuite) ●● P2
176. ITSM/CMMS connectors (ServiceNow/Maximo migration) ●● P3
177. Identity providers (Okta/Azure AD/Google/SAML) ●●● P2
178. Comms (Slack/Teams/Twilio/SendGrid) ●● P2
179. Marketplace of connectors & industry packs ● P5
180. Developer portal, API keys & rate limits ●● P2
181. Zapier/Make/low-code connector ● P4
182. Data-warehouse export (Snowflake/BigQuery/Redshift) ●● P3

## M14 · Mobile & Field
183. Technician app (WO, scan, offline) ●●● P2
184. Manager app (approvals, dashboards) ●● P2
185. Security app (alerts, live map, custody) ●● P3
186. Executive app (KPIs, insights) ● P3
187. Offline-first sync & conflict resolution ●●● P2
188. QR/barcode/RFID/NFC scanning ●●● P2
189. Camera capture & annotation ●● P2
190. GPS/location capture in field ●● P2
191. Push notifications ●●● P2
192. Voice commands / voice-to-WO ● P4
193. Wearable/handheld-scanner support ● P3

## M15 · Digital Twin & Visualization
194. 2D floor-plan asset overlay ●● P3
195. 3D facility/building twin ● P4
196. Real-time state sync to twin ● P4
197. Twin simulation & scenario modeling ● P4
198. Space/occupancy & utilization overlay ● P4
199. BIM/CAD import ● P5
200. AR asset navigation & overlay ● P5
201. Twin-based capacity planning ● P4

## M16 · Security & Identity (product features)
202. SSO (SAML/OIDC) ●●● P2
203. MFA / passkeys ●●● P2
204. Fine-grained RBAC + ABAC ●●● P1
205. Row/field-level security ●●● P1
206. Session management & device trust ●● P2
207. API key & OAuth client management ●● P2
208. Break-glass access with audit ●● P2
209. IP allow-list / network policy ● P3
210. Encryption (at rest/in transit/field-level) ●●● P1
211. Secrets & key management (KMS/HSM) ●● P2
212. Security event log & SIEM export ●● P3

## M17 · Notifications & Collaboration
213. In-app activity feed & @mentions ●● P2
214. Comments & notes on assets/WOs ●● P1
215. Task assignment & follow-ups ●● P2
216. Shareable links (scoped, expiring) ●● P2
217. Digest & summary emails (AI) ●● P3
218. Announcement/broadcast to roles ● P3

## M18 · Search & Command
219. Global search (assets/WOs/people/docs) ●●● P1
220. Natural-language / semantic search ●● P3
221. ⌘K command palette (navigate + act) ●● P2
222. Saved searches & smart lists ●● P1
223. Barcode/QR scan-to-search ●●● P2
224. Faceted filtering & query builder ●● P1

## M19 · System, Monitoring & Ops
225. Tenant health & SLA dashboard (platform) ●● P1
226. Ingest/throughput & lag monitoring ●● P2
227. Audit of admin & config changes ●● P1
228. Error tracking & incident tooling ●● P2
229. Usage analytics & adoption metrics ●● P2
230. Rate limiting & quota management ●● P2
231. Backup, restore & DR runbooks ●● P2
232. Status page & maintenance windows ● P2

## M20 · Onboarding, Help & Growth
233. Guided onboarding & setup wizard ●● P1
234. In-app tours & contextual help ●● P2
235. Template gallery (industry packs) ●● P3
236. Knowledge base & docs ●● P1
237. Support ticketing & chat ●● P2
238. Sandbox/demo data generator ●● P1
239. Health-check & adoption scorecard ● P3
240. Sample dashboards per industry ●● P2

---

## Cross-cutting features (apply to every module)

241. Multi-tenancy & data isolation · 242. Multi-facility scope switching · 243. Audit trail on every entity ·
244. Soft-delete + restore · 245. Optimistic UI + undo · 246. Bulk operations · 247. CSV/Excel export everywhere ·
248. Column config & saved views · 249. Advanced filters & saved filters · 250. Real-time updates (live) ·
251. Dark/light theming · 252. Full keyboard navigation · 253. WCAG 2.1 AA accessibility ·
254. Responsive/mobile-web · 255. Localization (i18n/l10n) · 256. Time-zone awareness ·
257. Empty/loading/error states everywhere · 258. Inline validation · 259. Contextual permissions ·
260. Optimistic caching & prefetch · 261. Print-friendly views · 262. Deep-linkable state ·
263. Global command palette · 264. Contextual AI "Explain this" · 265. Feedback capture per view ·
266. Notifications preferences per user · 267. Favorites/pins · 268. Recent items ·
269. Watchlists (subscribe to asset changes) · 270. Tagging & labels across entities.

## AI-native features (highlighted for sales)

271. Explainable Health Score · 272. Failure prediction w/ confidence · 273. RUL estimation ·
274. Anomaly detection · 275. Theft/loss prediction · 276. Idle detection · 277. Overuse detection ·
278. Composite risk score · 279. Cost-optimization engine · 280. Utilization rebalancing ·
281. Lifecycle/EOL prediction · 282. Replacement recommender · 283. Demand/capacity forecast ·
284. Digital-twin simulation · 285. AI Copilot (agentic) · 286. NL search · 287. Generative reports ·
288. Per-asset AI chat · 289. Recommendation feed · 290. Drift monitoring · 291. HITL feedback loop ·
292. Auto-classification from images · 293. Predictive parts pre-staging · 294. Smart alert correlation ·
295. AI audit-anomaly detection · 296. Lease-vs-buy analysis · 297. Capex-deferral finder ·
298. Duplicate/ghost detection · 299. Data-quality auto-repair suggestions · 300. AI dashboard narration ·
301. Voice-to-work-order · 302. Predictive staffing/scheduling · 303. Energy-optimization insights ·
304. Contract/warranty-claim recommender.

**Total: 300+ discrete features across 20 modules + cross-cutting + AI-native.**
