const express = require('express');
const path = require('path');

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

// 시뮬레이터 라우트
app.get('/simulator', (req, res) => {
    res.render('simulator', {
        title: '건물 에너지 분석 시뮬레이터'
    });
});

// 시간 슬라이더 테스트 라우트
app.get('/time-slider', (req, res) => {
    res.render('time-slider', {
        title: 'Time Slider Test - 0~8000 Step 0.1'
    });
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