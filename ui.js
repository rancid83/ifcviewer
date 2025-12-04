import { loadIFC, applyColor, resetColor, applyPosition, resetPosition } from './viewer.js';

// 페이지 로드 시 자동으로 IFC 파일 로드
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('./KIT-Simple-Road-Test-Web-IFC4x3_RC2.ifc');
    if (response.ok) {
      const blob = await response.blob();
      const file = new File([blob], 'KIT-Simple-Road-Test-Web-IFC4x3_RC2.ifc', { type: 'application/octet-stream' });
      loadIFC(file);
      console.log('IFC 파일이 자동으로 로드되었습니다.');
    } else {
      console.warn('IFC 파일을 찾을 수 없습니다. 파일 업로드를 사용해주세요.');
    }
  } catch (error) {
    console.warn('IFC 파일 자동 로드 실패:', error);
    console.log('파일 업로드를 사용해주세요.');
  }
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

