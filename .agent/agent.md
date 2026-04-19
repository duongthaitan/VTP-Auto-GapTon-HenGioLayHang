# Agent Skills — Coding Edition

> Mục tiêu: Ra code ngay, không hỏi vòng vo, không giải thích dài dòng, không nói "Tôi có thể giúp bạn..."

---

## 1. CODE FIRST, EXPLAIN NEVER

- Khi user yêu cầu code → **viết code ngay**, không hỏi lại trừ khi thiếu thông tin bắt buộc (như tên DB, framework version).
- Không mở đầu bằng: "Tất nhiên!", "Đây là giải pháp cho...", "Để giải quyết vấn đề này..."
- Không kết thúc bằng: "Bạn có muốn tôi giải thích thêm không?" hay "Hãy cho tôi biết nếu bạn cần..."
- Chỉ comment code khi logic **không tự nói lên được**.
- Nếu có nhiều cách làm → chọn cách tốt nhất, không liệt kê tất cả.

---

## 2. STACK MẶC ĐỊNH (nếu không chỉ định)

| Layer | Default |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | Node.js + Express hoặc FastAPI (Python) |
| DB | PostgreSQL (SQL) / MongoDB (NoSQL) |
| Auth | JWT + bcrypt |
| State | Zustand (React) |
| ORM | Prisma (Node) / SQLAlchemy (Python) |
| Test | Vitest / pytest |
| Deploy | Docker + docker-compose |

Nếu user nói "làm bằng X" → dùng X, không hỏi tại sao.

---

## 3. CODING STYLE — BẮT BUỘC

```
- Dùng async/await, không dùng .then().catch() lồng nhau
- Xử lý lỗi bằng try/catch rõ ràng, không để lỗi im lặng
- Đặt tên biến/hàm bằng tiếng Anh, camelCase (JS) / snake_case (Python)
- Không hard-code config → dùng .env
- Function ngắn: 1 function = 1 nhiệm vụ, tối đa ~30 dòng
- Không để console.log/print debug trong code production
- Ưu tiên immutability: const > let, không dùng var
- Return sớm (early return) thay vì if lồng nhau nhiều tầng
```

---

## 4. KHI ĐƯỢC YÊU CẦU TẠO FEATURE

**Luồng chuẩn:**
1. Schema / Model / Type trước
2. Logic / Service / Handler sau
3. Route / Controller / API cuối
4. Test nếu user yêu cầu

**Không hỏi:**
- "Bạn muốn dùng thư viện nào?" → tự chọn thư viện phổ biến nhất
- "Bạn muốn UI như thế nào?" → làm UI clean, functional trước
- "Bạn muốn validate ở đâu?" → validate ở tầng input, luôn luôn

---

## 5. KHI SỬA BUG

1. Đọc error message → xác định root cause ngay
2. Sửa đúng chỗ, không refactor cả file
3. Giải thích lỗi bằng **1 dòng** nếu cần
4. Không hỏi "Bạn có thể paste full error không?" nếu context đã đủ

---

## 6. KHI REVIEW CODE

- Chỉ nêu vấn đề **thực sự quan trọng**: bug, security, performance
- Không nêu style nit nhỏ nhặt trừ khi yêu cầu
- Đưa ra code đã sửa, không chỉ mô tả cần sửa gì
- Format: `[BUG]`, `[SECURITY]`, `[PERF]`, `[SUGGEST]`

---

## 7. API DESIGN — MẶC ĐỊNH REST

```
GET    /resources          → list
GET    /resources/:id      → detail
POST   /resources          → create
PUT    /resources/:id      → update (full)
PATCH  /resources/:id      → update (partial)
DELETE /resources/:id      → delete
```

- Response luôn có dạng `{ data, error, meta }`
- HTTP status code đúng chuẩn (200, 201, 400, 401, 403, 404, 500)
- Không tự ý thêm `/api/v1/` trừ khi user yêu cầu versioning

---

## 8. SECURITY — CHECKLIST TỰ ĐỘNG

Khi viết code liên quan đến auth, user input, DB → **tự động áp dụng**:

- [ ] Validate & sanitize mọi input từ client
- [ ] Không log password, token, sensitive data
- [ ] Dùng parameterized query, không string concat SQL
- [ ] Hash password bằng bcrypt (cost ≥ 10)
- [ ] JWT có expiry, refresh token lưu httpOnly cookie
- [ ] Rate limiting cho auth endpoint
- [ ] CORS config đúng, không `*` trên production

---

## 9. PERFORMANCE — DEFAULTS

- Pagination mặc định cho mọi list API (limit/offset hoặc cursor)
- Index DB cho các field thường query/filter/sort
- Cache kết quả expensive query (Redis hoặc in-memory)
- Lazy load component lớn trên frontend
- Debounce search input ≥ 300ms
- Không select `*` — chỉ lấy field cần thiết

---

## 10. FILE & PROJECT STRUCTURE

**Node/Express:**
```
src/
  controllers/
  services/
  routes/
  models/
  middlewares/
  utils/
  config/
index.ts
```

**React:**
```
src/
  components/    ← dùng lại được
  pages/         ← route-level
  hooks/
  stores/
  services/      ← API calls
  types/
  utils/
```

**Python/FastAPI:**
```
app/
  routers/
  models/
  schemas/
  services/
  dependencies/
  core/
main.py
```

---

## 11. OUTPUT FORMAT KHI TRẢ LỜI

- Code block phải có **ngôn ngữ** rõ ràng: ` ```ts `, ` ```py `, ` ```sql `
- Nếu nhiều file → mỗi file có header rõ: `// src/services/user.service.ts`
- Giải thích tối đa **3-5 dòng** sau code, không hơn
- Nếu cần chạy lệnh → wrap trong ` ```bash `

---

## 12. KHÔNG LÀM

- ❌ Không viết boilerplate thừa (constructor rỗng, comment TODO không liên quan)
- ❌ Không dùng `any` trong TypeScript trừ khi bắt buộc
- ❌ Không tạo class khi function thuần là đủ
- ❌ Không giải thích những thứ hiển nhiên với dev
- ❌ Không hỏi permission để bắt đầu code
- ❌ Không thêm feature không được yêu cầu