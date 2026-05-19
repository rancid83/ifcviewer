const express = require('express');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const app = express();
const PORT = process.env.PORT || 3000;

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 요청 본문 파서 (chunk 편집 API용)
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '150mb', type: ['text/plain', 'text/csv', 'application/csv'] }));

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// IFC 파일 서빙
app.use('/files', express.static(path.join(__dirname)));

// 메인 라우트
app.get('/', (req, res) => {
    res.render('index', {
        title: 'IFC 뷰어',
        ifcFileName: 'tessellated-item.ifc'
    });
});

// 색상 변경 뷰어 라우트
app.get('/color-viewer', (req, res) => {
    res.render('color-viewer', {
        title: 'IFC 색상 변경 뷰어'
    });
});

// 시뮬레이터 라우트 (어두운 테마 - 기본)
app.get('/simulator-v0', (req, res) => {
    res.render('simulator', {
        title: '건물 에너지 분석 시뮬레이터'
    });
});

// 시뮬레이터 라우트 (밝은 테마)
app.get('/simulator-white', (req, res) => {
    res.render('simulator-white', {
        title: '건물 에너지 분석 시뮬레이터'
    });
});

// 시뮬레이터 라우트 v1 (simulation 데이터 사용)
app.get('/simulator-v1', (req, res) => {
    res.render('simulator-v1', {
        title: '건물 에너지 분석 시뮬레이터 v1'
    });
});

// 시뮬레이터 라우트 v2 (simulation2 데이터 사용)
app.get('/simulator', (req, res) => {
    res.render('simulator-v2', {
        title: '건물 에너지 분석 시뮬레이터 v2'
    });
});

// 최적화 검증 페이지 라우트 (최적화 로직 단독 검증용)
app.get('/optimization-check', (req, res) => {
    res.render('optimization-check', {
        title: '최적화 로직 검증'
    });
});

// 데이터 보정 도구 (CSV 업로드 → chunk 재생성 / frame 직접 편집)
app.get('/chunk-editor', (req, res) => {
    res.render('chunk-editor', {
        title: '데이터 보정 도구'
    });
});

// 개발/검증 도구 모음 (허브 페이지)
app.get('/tools', (req, res) => {
    res.render('tools', {
        title: '개발/검증 도구 모음'
    });
});

// 시간 슬라이더 테스트 라우트
app.get('/time-slider', (req, res) => {
    res.render('time-slider', {
        title: 'Time Slider Test - 0~8000 Step 0.1'
    });
});

// 데이터 인스펙터 라우트 (시뮬레이터 입력 데이터 검증용)
app.get('/data-inspector', (req, res) => {
    res.render('data-inspector', {
        title: '데이터 인스펙터'
    });
});

// 데이터 인스펙터 - 케이스 목록 조회
app.get('/api/inspect/cases', (req, res) => {
    try {
        const simRoot = path.join(__dirname, 'public', 'data', 'simulation2');
        const csvRoot = path.join(__dirname, 'public', 'data', 'Result_file2_csv');
        const simDirs = fs.readdirSync(simRoot)
            .filter(n => /^case\d+-(summer|winter)$/.test(n))
            .sort();
        const csvFiles = new Set(
            fs.existsSync(csvRoot)
                ? fs.readdirSync(csvRoot).filter(n => /^Case_\d+_(Summer|Winter)\.csv$/i.test(n))
                : []
        );
        const items = simDirs.map(dir => {
            const m = dir.match(/^case(\d+)-(summer|winter)$/);
            const caseNum = m[1];
            const season = m[2];
            const csvName = `Case_${caseNum.padStart(2, '0')}_${season[0].toUpperCase() + season.slice(1)}.csv`;
            return {
                caseId: caseNum,
                season,
                simDir: dir,
                csvFile: csvName,
                csvAvailable: csvFiles.has(csvName)
            };
        });
        res.json({ count: items.length, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CSV에서 특정 행만 읽어 반환 (스트리밍, 전체 로드 안 함)
function readCsvRow(filePath, targetRowIndex) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return resolve({ available: false, header: null, row: null });
        }
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        let header = null;
        let dataIdx = 0;
        let resolved = false;
        rl.on('line', (line) => {
            if (resolved) return;
            if (header === null) {
                header = line.split(',');
                return;
            }
            if (dataIdx === targetRowIndex) {
                const cols = line.split(',');
                const row = {};
                header.forEach((h, i) => { row[h] = cols[i]; });
                resolved = true;
                rl.close();
                resolve({ available: true, header, row, rowIndex: dataIdx });
                return;
            }
            dataIdx += 1;
        });
        rl.on('close', () => {
            if (!resolved) {
                resolved = true;
                resolve({ available: true, header, row: null, rowIndex: dataIdx, outOfRange: true });
            }
        });
        rl.on('error', (err) => reject(err));
    });
}

// CSV 에서 Month/Day/Hour 가 일치하는 행을 검색 (스트리밍)
function readCsvRowByTime(filePath, month, day, hour) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) {
            return resolve({ available: false, header: null, row: null });
        }
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });
        let header = null, col = {}, dataIdx = 0, resolved = false;
        rl.on('line', (line) => {
            if (resolved) return;
            if (header === null) {
                header = line.split(',');
                header.forEach((h, i) => { col[h.trim()] = i; });
                return;
            }
            const cols = line.split(',');
            const mo = Math.round(parseFloat(cols[col['Month']]));
            const da = Math.round(parseFloat(cols[col['Day']]));
            const hr = parseFloat(cols[col['Hour']]);
            if (mo === month && da === day && Math.abs(hr - hour) < 0.001) {
                const row = {};
                header.forEach((h, i) => { row[h] = cols[i]; });
                resolved = true;
                rl.close();
                resolve({ available: true, header, row, rowIndex: dataIdx });
                return;
            }
            dataIdx += 1;
        });
        rl.on('close', () => { if (!resolved) resolve({ available: true, header, row: null }); });
        rl.on('error', () => { if (!resolved) resolve({ available: false, header: null, row: null }); });
    });
}

// 데이터 인스펙터 - 단일 시점 비교 (chunk frame 의 실제 시각 기준으로 CSV 를 매칭)
app.get('/api/inspect/frame', async (req, res) => {
    try {
        const caseId = String(req.query.case || '').padStart(2, '0');
        const season = String(req.query.season || '').toLowerCase();
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        const caseDir = path.join(__dirname, 'public', 'data', 'simulation2', `case${caseId}-${season}`);
        const idxPath = path.join(caseDir, 'index.json');
        if (!fs.existsSync(idxPath)) {
            return res.status(404).json({ error: '케이스가 없습니다.' });
        }
        const meta = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        const CHUNK_SIZE = 1440;

        const date = String(req.query.date || '');
        let timeQ = String(req.query.time || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(timeQ)) timeQ += ':00';

        // chunk frame 확보: 날짜+시각이 있으면 time 으로 검색, 없으면 minute 인덱스로 직접
        let chunkFrame = null, chunkIdx = -1, localIdx = -1;
        if (date && timeQ) {
            const target = `${date} ${timeQ}`;
            for (let c = 0; c < meta.numChunks && !chunkFrame; c++) {
                const cp = path.join(caseDir, `chunk-${c}.json`);
                if (!fs.existsSync(cp)) continue;
                const data = (JSON.parse(fs.readFileSync(cp, 'utf8')).data) || [];
                for (let li = 0; li < data.length; li++) {
                    if (String(data[li].time) === target) {
                        chunkFrame = data[li]; chunkIdx = c; localIdx = li; break;
                    }
                }
            }
        } else {
            const minute = Math.max(0, Number(req.query.minute || 0));
            chunkIdx = Math.floor(minute / CHUNK_SIZE);
            localIdx = minute % CHUNK_SIZE;
            const cp = path.join(caseDir, `chunk-${chunkIdx}.json`);
            if (fs.existsSync(cp)) {
                const data = (JSON.parse(fs.readFileSync(cp, 'utf8')).data) || [];
                chunkFrame = data[localIdx] || null;
            }
        }
        const chunkResult = {
            available: !!chunkFrame, frame: chunkFrame,
            chunkIndex: chunkIdx, localIndex: localIdx
        };

        // chunk frame 의 실제 시각으로 CSV 의 같은 시각 행을 검색 → 항상 동일 시점끼리 비교
        const csvName = `Case_${caseId}_${season[0].toUpperCase() + season.slice(1)}.csv`;
        const csvPath = path.join(__dirname, 'public', 'data', 'Result_file2_csv', csvName);
        let csvResult = { available: false, filename: csvName, row: null, header: null, note: null };
        if (chunkFrame) {
            const m = String(chunkFrame.time).match(/(\d+)-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
            if (m) {
                const month = parseInt(m[2], 10);
                const day = parseInt(m[3], 10);
                const hour = parseInt(m[4], 10) + parseInt(m[5], 10) / 60;
                const csvRead = await readCsvRowByTime(csvPath, month, day, hour);
                csvResult = {
                    available: csvRead.available && csvRead.row != null,
                    filename: csvName,
                    rowIndex: csvRead.rowIndex,
                    row: csvRead.row,
                    header: csvRead.header,
                    note: csvRead.available
                        ? (csvRead.row ? null : '해당 시각의 CSV 행을 찾지 못함')
                        : 'CSV 파일 없음 (Result_file2_csv 미제공 케이스)'
                };
            }
        }

        let comparison = null;
        if (chunkResult.frame && csvResult.row) {
            const csvQ = parseFloat(csvResult.row['Q_sens_test_cell']);
            const chunkQ = chunkResult.frame.Qsens_test;
            const diff = Math.abs(csvQ - chunkQ);
            comparison = { csvQsens: csvQ, chunkQsens: chunkQ, absDiff: diff, match: diff < 0.01 };
        }

        res.json({
            caseId, season,
            minute: chunkIdx >= 0 ? chunkIdx * CHUNK_SIZE + localIdx : 0,
            time: chunkFrame ? chunkFrame.time : null,
            chunk: chunkResult,
            csv: csvResult,
            comparison
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// 데이터 보정 도구 (chunk 재생성 / frame 편집)
// ============================================

// 0~24 소수 시각 → "HH:MM:SS"
function hourToTimeStr(hourDecimal) {
    let totalSec = Math.max(0, Math.min(86400 - 1, Math.round(hourDecimal * 3600)));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// CSV/txt 텍스트 → chunk record 배열 (헤더 컬럼명 기반 매핑, 시간순 정렬 + 중복 제거)
function parseSourceToRecords(text, season, year) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return { records: [], error: '데이터 행이 없습니다.' };
    const delim = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
    const header = lines[0].split(delim).map(h => h.trim());
    const col = {};
    header.forEach((h, i) => { col[h] = i; });
    const need = ['Month', 'Day', 'Hour', 'Q_sens_test_cell'];
    const missing = need.filter(n => col[n] == null);
    if (missing.length) return { records: [], error: '헤더에 다음 컬럼이 필요합니다: ' + missing.join(', ') };

    const gv = (parts, name) => {
        const i = col[name];
        if (i == null) return NaN;
        return parseFloat(String(parts[i]).trim());
    };
    const r4 = x => (isNaN(x) ? 0 : Math.round(x * 10000) / 10000);
    const records = [];
    for (let li = 1; li < lines.length; li++) {
        const parts = lines[li].split(delim);
        const month = Math.round(gv(parts, 'Month'));
        const day = Math.round(gv(parts, 'Day'));
        const hour = gv(parts, 'Hour');
        if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31) || isNaN(hour)) continue;
        const tCell = gv(parts, 'T_air_test_cell');
        const tH = gv(parts, 'T_h_set');
        const tC = gv(parts, 'T_c_set');
        records.push({
            time: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hourToTimeStr(hour)}`,
            T_external: r4(gv(parts, 'OA')),
            T_air_test: r4(tCell),
            T_air_ref: r4(tCell),
            Qsens_test: r4(gv(parts, 'Q_sens_test_cell')),
            Qsens_ref: 0.0,
            Tset: r4(season === 'summer' ? tC : tH),
            T_air_test_cell: r4(tCell),
            T_h_set: r4(tH),
            T_c_set: r4(tC),
            Month: month,
            Day: day,
            Hour: r4(hour)
        });
    }
    records.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const out = [];
    let seen = null, dup = 0;
    for (const r of records) {
        if (r.time === seen) { dup++; continue; }
        seen = r.time;
        out.push(r);
    }
    return { records: out, dup };
}

// records → chunk-*.json + index.json 쓰기
function writeChunkFiles(caseDir, records, season) {
    const CHUNK = 1440;
    fs.readdirSync(caseDir)
        .filter(n => /^chunk-\d+\.json$/.test(n))
        .forEach(n => fs.unlinkSync(path.join(caseDir, n)));
    const numChunks = Math.ceil(records.length / CHUNK) || 0;
    for (let ci = 0; ci < numChunks; ci++) {
        const data = records.slice(ci * CHUNK, ci * CHUNK + CHUNK);
        fs.writeFileSync(path.join(caseDir, `chunk-${ci}.json`),
            JSON.stringify({ data }, null, 2), 'utf8');
    }
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (const r of records) {
        const q = r.Qsens_test || 0;
        if (q < mn) mn = q;
        if (q > mx) mx = q;
        sum += q;
    }
    if (!records.length) { mn = 0; mx = 0; }
    const avg = records.length ? sum / records.length : 0;
    const m = path.basename(caseDir).match(/^case(\d+)-(summer|winter)$/);
    const index = {
        sheetName: `Case${m[1]}_${season[0].toUpperCase() + season.slice(1)}`,
        totalFrames: records.length,
        numChunks,
        chunkSize: CHUNK,
        startTime: records.length ? records[0].time : '',
        endTime: records.length ? records[records.length - 1].time : '',
        minEnergyTest: mn, maxEnergyTest: mx, avgEnergyTest: avg,
        minEnergyRef: mn, maxEnergyRef: mx, avgEnergyRef: avg,
        season,
        startDate: records.length ? records[0].time.split(' ')[0] : ''
    };
    fs.writeFileSync(path.join(caseDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
    return index;
}

// CSV/txt 업로드 → 케이스 chunk 전체 재생성
app.post('/api/chunk/rebuild', (req, res) => {
    try {
        const caseId = String(req.query.case || '').padStart(2, '0');
        const season = String(req.query.season || '').toLowerCase();
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        const text = typeof req.body === 'string' ? req.body : '';
        if (!text.trim()) return res.status(400).json({ error: 'CSV 본문이 비어 있습니다.' });
        const caseDir = path.join(__dirname, 'public', 'data', 'simulation2', `case${caseId}-${season}`);
        if (!fs.existsSync(caseDir)) return res.status(404).json({ error: '케이스 폴더가 없습니다.' });

        const parsed = parseSourceToRecords(text, season, 2025);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        if (!parsed.records.length) return res.status(400).json({ error: '유효한 데이터 행이 없습니다.' });

        // 백업: 케이스 폴더 전체 복사
        const backupDir = caseDir + '.bak-' + Date.now();
        fs.mkdirSync(backupDir);
        fs.readdirSync(caseDir).forEach(n => {
            const src = path.join(caseDir, n);
            if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(backupDir, n));
        });

        const index = writeChunkFiles(caseDir, parsed.records, season);
        res.json({ ok: true, index, duplicatesRemoved: parsed.dup || 0, backup: path.basename(backupDir) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// frame 조회 (날짜+시각으로 정확 매칭)
app.get('/api/chunk/frame', (req, res) => {
    try {
        const caseId = String(req.query.case || '').padStart(2, '0');
        const season = String(req.query.season || '').toLowerCase();
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        const caseDir = path.join(__dirname, 'public', 'data', 'simulation2', `case${caseId}-${season}`);
        const idxPath = path.join(caseDir, 'index.json');
        if (!fs.existsSync(idxPath)) return res.status(404).json({ error: '케이스가 없습니다.' });
        const meta = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        const date = String(req.query.date || '');
        let time = String(req.query.time || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(time)) time += ':00';
        if (!date || !time) return res.status(400).json({ error: '날짜와 시각을 입력하세요.' });
        const target = `${date} ${time}`;
        for (let ci = 0; ci < meta.numChunks; ci++) {
            const cp = path.join(caseDir, `chunk-${ci}.json`);
            if (!fs.existsSync(cp)) continue;
            const data = (JSON.parse(fs.readFileSync(cp, 'utf8')).data) || [];
            for (let li = 0; li < data.length; li++) {
                if (String(data[li].time) === target) {
                    return res.json({ ok: true, found: true, chunkIndex: ci, localIndex: li, frame: data[li] });
                }
            }
        }
        res.json({ ok: true, found: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// frame 1개 값 수정
app.post('/api/chunk/frame', (req, res) => {
    try {
        const b = req.body || {};
        const caseId = String(b.case || '').padStart(2, '0');
        const season = String(b.season || '').toLowerCase();
        const chunkIndex = Number(b.chunkIndex);
        const localIndex = Number(b.localIndex);
        const updates = b.updates || {};
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        if (!Number.isInteger(chunkIndex) || !Number.isInteger(localIndex)) {
            return res.status(400).json({ error: 'chunkIndex/localIndex 가 필요합니다.' });
        }
        const cp = path.join(__dirname, 'public', 'data', 'simulation2',
            `case${caseId}-${season}`, `chunk-${chunkIndex}.json`);
        if (!fs.existsSync(cp)) return res.status(404).json({ error: 'chunk 파일이 없습니다.' });
        const json = JSON.parse(fs.readFileSync(cp, 'utf8'));
        if (!json.data || !json.data[localIndex]) {
            return res.status(400).json({ error: 'localIndex 범위를 벗어났습니다.' });
        }
        // 백업: 해당 chunk 파일
        fs.copyFileSync(cp, cp + '.bak-' + Date.now());
        const frame = json.data[localIndex];
        const before = Object.assign({}, frame);
        Object.keys(updates).forEach(k => {
            if (k === 'time') return; // time 키는 변경 금지
            if (k in frame) {
                const num = parseFloat(updates[k]);
                frame[k] = isNaN(num) ? updates[k] : num;
            }
        });
        fs.writeFileSync(cp, JSON.stringify(json, null, 2), 'utf8');
        res.json({ ok: true, before, after: frame });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 케이스 chunk 데이터를 CSV 로 내보내기 (다운로드 → 수정 → 재업로드 용)
app.get('/api/chunk/export', (req, res) => {
    try {
        const caseId = String(req.query.case || '').padStart(2, '0');
        const season = String(req.query.season || '').toLowerCase();
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        const caseDir = path.join(__dirname, 'public', 'data', 'simulation2', `case${caseId}-${season}`);
        const idxPath = path.join(caseDir, 'index.json');
        if (!fs.existsSync(idxPath)) return res.status(404).json({ error: '케이스가 없습니다.' });
        const meta = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        const from = String(req.query.from || '');
        const to = String(req.query.to || '');

        const lines = ['TIME,OA,T_air_test_cell,Qsol,Sign,Q_sens_test_cell,T_h_set,T_c_set,Month,Day,Hour'];
        let n = 0, done = false;
        for (let ci = 0; ci < meta.numChunks && !done; ci++) {
            const cp = path.join(caseDir, `chunk-${ci}.json`);
            if (!fs.existsSync(cp)) continue;
            const data = (JSON.parse(fs.readFileSync(cp, 'utf8')).data) || [];
            for (const f of data) {
                const date = String(f.time).slice(0, 10);
                if (from && date < from) continue;
                if (to && date > to) { done = true; break; }
                lines.push([
                    (n / 60).toFixed(6), f.T_external, f.T_air_test_cell, 0, 1,
                    f.Qsens_test, f.T_h_set, f.T_c_set, f.Month, f.Day, f.Hour
                ].join(','));
                n++;
            }
        }
        const suffix = (from || to) ? `_${from || 'start'}_${to || 'end'}` : '';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',
            `attachment; filename="sample_case${caseId}_${season}${suffix}.csv"`);
        res.send(lines.join('\n'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 시계열 데이터 API (chunk 단위로 제공)
app.get('/api/timeseries', (req, res) => {
    const from = Math.max(0, Math.min(80000, Number(req.query.from || 0)));
    const to = Math.max(0, Math.min(80000, Number(req.query.to || 200)));

    const data = [];
    for (let i = from; i <= to; i++) {
        data.push({
            index: i,
            step: (i / 10).toFixed(1),
            value: Math.sin(i / 200) * 50 + 50, // 더미 데이터
            timestamp: `시간: ${Math.floor(i / 600)}:${String(Math.floor((i % 600) / 10)).padStart(2, '0')}`
        });
    }

    res.json({ from, to, count: data.length, data });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log(`IFC 뷰어를 열려면 브라우저에서 위 주소를 방문하세요.`);
});
