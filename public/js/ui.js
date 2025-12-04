import { loadIFC, loadIFCFromURL, applyColor, resetColor, applyPosition, resetPosition } from '/js/viewer.js';

// 페이지 로드 시 자동으로 IFC 파일 로드
window.addEventListener('DOMContentLoaded', () => {
    // IFC 파일 URL
    const ifcFileUrl = '/files/tessellated-item.ifc';
    const ifcFileName = 'tessellated-item.ifc';

    // URL에서 직접 로드 (더 효율적)
    console.log('IFC 파일 자동 로드 시작:', ifcFileUrl);
    loadIFCFromURL(ifcFileUrl, ifcFileName);
});

// IFC 파일 업로드 처리
const ifcUpload = document.getElementById('ifc-upload');
ifcUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        if (file.name.toLowerCase().endsWith('.ifc')) {
            loadIFC(file);
        } else {
            alert('IFC 파일만 업로드할 수 있습니다.');
            event.target.value = ''; // 입력 초기화
        }
    }
});

// 색상 적용 버튼
const applyColorBtn = document.getElementById('apply-color');
applyColorBtn.addEventListener('click', () => {
    const color = document.getElementById('color-picker').value;
    applyColor(color);
});

// 색상 초기화 버튼
const resetColorBtn = document.getElementById('reset-color');
resetColorBtn.addEventListener('click', () => {
    resetColor();
});

// 위치 적용 버튼
const applyPositionBtn = document.getElementById('apply-position');
applyPositionBtn.addEventListener('click', () => {
    const x = parseFloat(document.getElementById('pos-x').value) || 0;
    const y = parseFloat(document.getElementById('pos-y').value) || 0;
    const z = parseFloat(document.getElementById('pos-z').value) || 0;
    applyPosition(x, y, z);
});

// 위치 초기화 버튼
const resetPositionBtn = document.getElementById('reset-position');
resetPositionBtn.addEventListener('click', () => {
    resetPosition();
    // 입력 필드도 초기화
    document.getElementById('pos-x').value = '0';
    document.getElementById('pos-y').value = '0';
    document.getElementById('pos-z').value = '0';
});