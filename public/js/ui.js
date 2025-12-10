import { loadIFC, loadIFCFromURL, applyColor, resetColor, applyPosition, resetPosition } from '/js/viewer.js';
import {
    initSimulationController,
    loadSimulationData,
    playSimulation,
    pauseSimulation,
    stopSimulation,
    toggleSimulationMode
} from '/js/simulation.js';

// 페이지 로드 시 자동으로 IFC 파일 로드
window.addEventListener('DOMContentLoaded', () => {
    // IFC 파일 URL
    const ifcFileUrl = '/files/T-LAB_1126.ifc';
    const ifcFileName = 'T-LAB_1126.ifc';

    // URL에서 직접 로드 (더 효율적)
    console.log('IFC 파일 자동 로드 시작:', ifcFileUrl);
    loadIFCFromURL(ifcFileUrl, ifcFileName);

    // 시뮬레이션 컨트롤러 초기화
    initSimulationController();
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

// ==================== 시뮬레이션 컨트롤 이벤트 ====================

// 시뮬레이션 데이터 로드 버튼
const loadSimDataBtn = document.getElementById('load-sim-data');
if (loadSimDataBtn) {
    loadSimDataBtn.addEventListener('click', () => {
        const dataInput = document.getElementById('sim-data-input');
        if (!dataInput) return;

        const dataText = dataInput.value.trim();
        if (!dataText) {
            alert('시뮬레이션 데이터를 입력해주세요.');
            return;
        }

        try {
            const data = JSON.parse(dataText);
            const success = loadSimulationData(data);

            if (success) {
                alert(`시뮬레이션 데이터 로드 완료! ${data.length}개 프레임`);
            } else {
                alert('시뮬레이션 데이터 로드에 실패했습니다.');
            }
        } catch (error) {
            console.error('시뮬레이션 데이터 파싱 오류:', error);
            alert('시뮬레이션 데이터 형식이 올바르지 않습니다.\n오류: ' + error.message);
        }
    });
}

// 재생 버튼
const simPlayBtn = document.getElementById('sim-play-btn');
if (simPlayBtn) {
    simPlayBtn.addEventListener('click', () => {
        playSimulation();
    });
}

// 일시정지 버튼
const simPauseBtn = document.getElementById('sim-pause-btn');
if (simPauseBtn) {
    simPauseBtn.addEventListener('click', () => {
        pauseSimulation();
    });
}

// 정지 버튼
const simStopBtn = document.getElementById('sim-stop-btn');
if (simStopBtn) {
    simStopBtn.addEventListener('click', () => {
        stopSimulation();
    });
}

// 시뮬레이션 모드 토글 버튼
const simModeToggleBtn = document.getElementById('simulation-mode-toggle');
if (simModeToggleBtn) {
    simModeToggleBtn.addEventListener('click', () => {
        toggleSimulationMode();
    });
}