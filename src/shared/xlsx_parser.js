// ============================================================
//  VTP Tool – Minimal XLSX Parser (vanilla, no dependencies)
//  v1.0
//  Đọc file .xlsx, trả về dữ liệu theo header columns.
//
//  Hỗ trợ:
//    - inlineStr (cell <c t="inlineStr"><is><t>...</t></is></c>)
//    - shared strings (cell <c t="s"><v>idx</v></c>)
//    - number cells (mặc định, không có thuộc tính t)
//    - File ZIP chứa entries lưu raw (stored) hoặc deflate
//
//  Dùng:
//    const rows = await VTPXlsx.parseFile(file, { headerRow: 1 });
//    rows = [{ MA_PHIEUGUI: '...', TEN_KHGUI: '...' }, ...]
// ============================================================

window.VTPXlsx = (function () {

    // ─── ZIP parser ──────────────────────────────────────────
    // Tham chiếu: PKZIP APPNOTE.TXT (ZIP file format spec)

    function findEOCD(view) {
        // End of Central Directory Record: signature 0x06054b50
        // Tối đa 22 + 65535 bytes từ cuối file
        const len = view.byteLength;
        const max = Math.min(len, 22 + 0xFFFF);
        for (let i = len - 22; i >= len - max; i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                const cdEntries = view.getUint16(i + 10, true);
                const cdSize    = view.getUint32(i + 12, true);
                const cdOffset  = view.getUint32(i + 16, true);
                // [Fix #30] ZIP64 signature: 0xFFFFFFFF in cdSize/cdOffset
                // hoặc 0xFFFF in cdEntries → file dùng ZIP64 extended fields,
                // parser hiện chưa hỗ trợ. Báo lỗi rõ ràng thay vì parse sai.
                if (cdEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
                    throw new Error('File Excel dùng ZIP64 (quá lớn) — chưa hỗ trợ. Vui lòng chia nhỏ file.');
                }
                return { cdEntries, cdSize, cdOffset };
            }
        }
        throw new Error('Không tìm thấy EOCD — file không phải ZIP/XLSX hợp lệ');
    }

    async function parseZip(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const eocd = findEOCD(view);
        const decoder = new TextDecoder('utf-8');
        const entries = new Map();

        let offset = eocd.cdOffset;
        for (let i = 0; i < eocd.cdEntries; i++) {
            // Central Directory Header: signature 0x02014b50
            if (view.getUint32(offset, true) !== 0x02014b50) {
                throw new Error('Lỗi đọc Central Directory tại offset ' + offset);
            }
            const compMethod    = view.getUint16(offset + 10, true);
            const compSize      = view.getUint32(offset + 20, true);
            const uncompSize    = view.getUint32(offset + 24, true);
            const fnameLen      = view.getUint16(offset + 28, true);
            const extraLen      = view.getUint16(offset + 30, true);
            const commentLen    = view.getUint16(offset + 32, true);
            const localOffset   = view.getUint32(offset + 42, true);
            const fname = decoder.decode(
                new Uint8Array(arrayBuffer, offset + 46, fnameLen)
            );
            entries.set(fname, { compMethod, compSize, uncompSize, localOffset });
            offset += 46 + fnameLen + extraLen + commentLen;
        }

        return { arrayBuffer, view, entries };
    }

    async function readEntry(zip, name) {
        const entry = zip.entries.get(name);
        if (!entry) throw new Error('ZIP entry không tồn tại: ' + name);

        // Local File Header: signature 0x04034b50
        const view = zip.view;
        const offset = entry.localOffset;
        if (view.getUint32(offset, true) !== 0x04034b50) {
            throw new Error('Lỗi đọc Local File Header: ' + name);
        }
        const fnameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const dataStart = offset + 30 + fnameLen + extraLen;

        const compressed = new Uint8Array(zip.arrayBuffer, dataStart, entry.compSize);

        if (entry.compMethod === 0) {
            // Stored — không nén
            return new TextDecoder('utf-8').decode(compressed);
        }
        if (entry.compMethod === 8) {
            // Deflate — dùng DecompressionStream native của Chrome
            const stream = new Blob([compressed]).stream()
                .pipeThrough(new DecompressionStream('deflate-raw'));
            const buf = await new Response(stream).arrayBuffer();
            return new TextDecoder('utf-8').decode(buf);
        }
        throw new Error('Compression method không hỗ trợ: ' + entry.compMethod);
    }

    // ─── XML parser ──────────────────────────────────────────

    function parseSharedStrings(xml) {
        if (!xml) return [];
        // Mỗi <si> là 1 string. Bên trong có thể có nhiều <t> (rich text)
        // → ghép tất cả <t>...</t> trong cùng 1 <si>
        const result = [];
        const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
        const tRegex  = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let m;
        while ((m = siRegex.exec(xml)) !== null) {
            let combined = '';
            let tm;
            tRegex.lastIndex = 0;
            while ((tm = tRegex.exec(m[1])) !== null) {
                combined += tm[1];
            }
            result.push(decodeXmlEntities(combined));
        }
        return result;
    }

    function decodeXmlEntities(s) {
        return s
            .replace(/&lt;/g,   '<')
            .replace(/&gt;/g,   '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g,  '&');
    }

    /** Convert "AB" → 27 (1-based), "A" → 0 (0-based) */
    function colRefToIndex(ref) {
        // ref ví dụ: "A1", "AB123" → trích chữ cái
        let col = 0;
        for (let i = 0; i < ref.length; i++) {
            const c = ref.charCodeAt(i);
            if (c < 65 || c > 90) break;
            col = col * 26 + (c - 64);
        }
        return col - 1;
    }

    function parseSheet(xml, sharedStrings) {
        // Trả về mảng các row — mỗi row là mảng cell values theo cột
        const rows = [];
        const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
        // [Fix #29] Cell regex flexible — bắt attribute không cố định thứ tự.
        // Group 1 = toàn bộ attributes (parse riêng để lấy r="..." và t="...")
        // Group 2 = inner content (rỗng nếu self-closing)
        const cellRegex = /<c\s+([^/>]*?)\s*(?:\/>|>([\s\S]*?)<\/c>)/g;
        const refRegex  = /\br="([A-Z]+\d+)"/;
        const typeRegex = /\bt="([^"]+)"/;

        let rm;
        while ((rm = rowRegex.exec(xml)) !== null) {
            const rowXml = rm[1];
            const row = [];
            let cm;
            cellRegex.lastIndex = 0;
            while ((cm = cellRegex.exec(rowXml)) !== null) {
                const attrs    = cm[1] || '';
                const inner    = cm[2] || '';
                const refMatch = attrs.match(refRegex);
                if (!refMatch) continue;
                const ref     = refMatch[1];
                const typeM   = attrs.match(typeRegex);
                const type    = typeM ? typeM[1] : 'n'; // n = number (mặc định)
                const colIdx  = colRefToIndex(ref);
                if (colIdx < 0) continue;

                let value = '';
                if (type === 'inlineStr') {
                    // <is><t>...</t></is> — có thể nhiều <t>
                    const tm = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g);
                    if (tm) value = tm.map(t => t.replace(/<[^>]+>/g, '')).join('');
                    value = decodeXmlEntities(value);
                } else if (type === 's') {
                    // <v>idx</v> → tra shared strings
                    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
                    if (vm) value = sharedStrings[parseInt(vm[1], 10)] || '';
                } else if (type === 'str' || type === 'n' || type === 'b') {
                    // Bỏ qua <f>...</f> nếu có (formula), chỉ lấy <v>
                    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
                    if (vm) value = decodeXmlEntities(vm[1]);
                }
                row[colIdx] = value;
            }
            rows.push(row);
        }
        return rows;
    }

    // ─── Public API ──────────────────────────────────────────

    /**
     * Đọc 1 File hoặc ArrayBuffer, trả về { headers, rows, byHeader }
     * - headers : ['MA_PHIEUGUI', 'TEN_KHGUI', ...]
     * - rows    : [['VTP123', 'SHOPEE', ...], ...]
     * - byHeader: [{ MA_PHIEUGUI: 'VTP123', TEN_KHGUI: 'SHOPEE', ... }, ...]
     */
    async function parseFile(fileOrBuffer, opts = {}) {
        const buffer = fileOrBuffer instanceof ArrayBuffer
            ? fileOrBuffer
            : await fileOrBuffer.arrayBuffer();

        const zip = await parseZip(buffer);

        // Nếu file có sharedStrings.xml thì đọc; không có cũng OK (file chỉ dùng inlineStr)
        let sharedStrings = [];
        if (zip.entries.has('xl/sharedStrings.xml')) {
            const ssXml = await readEntry(zip, 'xl/sharedStrings.xml');
            sharedStrings = parseSharedStrings(ssXml);
        }

        // Đọc sheet đầu tiên
        const sheetName = opts.sheet || 'xl/worksheets/sheet1.xml';
        if (!zip.entries.has(sheetName)) {
            throw new Error('Không tìm thấy ' + sheetName + ' trong file');
        }
        const sheetXml = await readEntry(zip, sheetName);
        const rows     = parseSheet(sheetXml, sharedStrings);

        if (rows.length === 0) {
            return { headers: [], rows: [], byHeader: [] };
        }

        const headerRowIdx = (opts.headerRow || 1) - 1;
        const headers      = (rows[headerRowIdx] || []).map(h => (h || '').trim());

        const byHeader = [];
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const obj = {};
            for (let c = 0; c < headers.length; c++) {
                const key = headers[c];
                if (!key) continue;
                obj[key] = (row[c] !== undefined && row[c] !== null) ? String(row[c]) : '';
            }
            byHeader.push(obj);
        }

        return { headers, rows: rows.slice(headerRowIdx + 1), byHeader };
    }

    /**
     * Group rows theo trường groupBy, trả về Map<groupValue, valueArray>
     * - rows    : kết quả parseFile().byHeader
     * - groupBy : tên cột (vd 'TEN_KHGUI')
     * - pickField: tên cột lấy giá trị (vd 'MA_PHIEUGUI')
     *
     * Trả về Map<string, string[]> — key sort theo số đơn giảm dần.
     * [Fix #31] Trim NBSP ( ) và whitespace ở cả key lẫn value để
     * tránh khách trùng lặp do dấu cách lạ, và mã đơn rỗng/null.
     */
    function groupBy(byHeader, groupByField, pickField) {
        const map = new Map();
        const cleanCell = (s) => (s == null ? '' : String(s))
            .replace(/ /g, ' ')   // NBSP → space thường
            .replace(/\s+/g, ' ')      // gộp whitespace
            .trim();
        for (const row of byHeader) {
            const key = cleanCell(row[groupByField]);
            const val = cleanCell(row[pickField]);
            if (!key || !val) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(val);
        }
        // Sort theo số đơn giảm dần
        const sorted = Array.from(map.entries())
            .sort((a, b) => b[1].length - a[1].length);
        return new Map(sorted);
    }

    return { parseFile, groupBy };
})();
