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
    ifcFileName: 'KIT-Simple-Road-Test-Web-IFC4x3_RC2.ifc'
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`IFC 뷰어를 열려면 브라우저에서 위 주소를 방문하세요.`);
});

