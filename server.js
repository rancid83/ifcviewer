const express = require('express');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const app = express();
const PORT = process.env.PORT || 3000;

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// 데이터 인스펙터 - 단일 시점 비교
app.get('/api/inspect/frame', async (req, res) => {
    try {
        const caseId = String(req.query.case || '').padStart(2, '0');
        const season = String(req.query.season || '').toLowerCase();
        const minute = Math.max(0, Number(req.query.minute || 0));
        if (!/^\d{2}$/.test(caseId) || !['summer', 'winter'].includes(season)) {
            return res.status(400).json({ error: 'invalid case/season' });
        }
        const CHUNK_SIZE = 1440;
        const chunkIdx = Math.floor(minute / CHUNK_SIZE);
        const localIdx = minute % CHUNK_SIZE;

        // chunk JSON 로드
        const chunkPath = path.join(
            __dirname, 'public', 'data', 'simulation2',
            `case${caseId}-${season}`, `chunk-${chunkIdx}.json`
        );
        let chunkResult = { available: false, frame: null, chunkIndex: chunkIdx, localIndex: localIdx };
        if (fs.existsSync(chunkPath)) {
            const json = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
            const frame = (json.data && json.data[localIdx]) || null;
            chunkResult = {
                available: true, frame, chunkIndex: chunkIdx, localIndex: localIdx,
                totalInChunk: (json.data || []).length
            };
        }

        // CSV 같은 시점 (CSV 첫 행 = Day=32 무효 행 → chunk 인덱스 + 1)
        const csvName = `Case_${caseId}_${season[0].toUpperCase() + season.slice(1)}.csv`;
        const csvPath = path.join(__dirname, 'public', 'data', 'Result_file2_csv', csvName);
        const csvRowIndex = minute + 1;
        const csvRead = await readCsvRow(csvPath, csvRowIndex);
        const csvResult = {
            available: csvRead.available && csvRead.row != null,
            filename: csvName,
            rowIndex: csvRowIndex,
            row: csvRead.row,
            header: csvRead.header,
            note: csvRead.available
                ? (csvRead.row ? null : 'rowIndex 범위 초과')
                : 'CSV 파일 없음 (Result_file2_csv 미제공 케이스)'
        };

        // 비교
        let comparison = null;
        if (chunkResult.frame && csvResult.row) {
            const csvQ = parseFloat(csvResult.row['Q_sens_test_cell']);
            const chunkQ = chunkResult.frame.Qsens_test;
            const diff = Math.abs(csvQ - chunkQ);
            comparison = {
                csvQsens: csvQ,
                chunkQsens: chunkQ,
                absDiff: diff,
                match: diff < 0.01
            };
        }

        res.json({
            caseId, season, minute,
            chunk: chunkResult,
            csv: csvResult,
            comparison
        });
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
