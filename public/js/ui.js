import { loadIFC, loadIFCFromURL, applyColor, resetColor, applyPosition, resetPosition, loadAllElementsList, resetAllElementColors, getCurrentModelID, toggleColorChangeMode, deleteSelectedElement, restoreAllDeletedElements, getDeletedElements, applyColorToElement } from '/js/viewer.js';
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

// 투명도 슬라이더 이벤트
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

if (opacitySlider && opacityValue) {
    opacitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        opacityValue.textContent = `${value}%`;
    });
}

// 색상 적용 버튼
const applyColorBtn = document.getElementById('apply-color');
applyColorBtn.addEventListener('click', () => {
    const color = document.getElementById('color-picker').value;
    const opacity = opacitySlider ? parseFloat(opacitySlider.value) / 100 : 1.0;
    applyColor(color, opacity);
});

// 색상 초기화 버튼
const resetColorBtn = document.getElementById('reset-color');
resetColorBtn.addEventListener('click', () => {
    resetColor();
});

// 색상 변경 모드 토글 버튼
const toggleColorModeBtn = document.getElementById('toggle-color-mode');
if (toggleColorModeBtn) {
    toggleColorModeBtn.addEventListener('click', () => {
        const isActive = toggleColorChangeMode();
        if (isActive) {
            toggleColorModeBtn.textContent = '색상 변경 모드: ON';
            toggleColorModeBtn.style.backgroundColor = '#28a745';
        } else {
            toggleColorModeBtn.textContent = '색상 변경 모드: OFF';
            toggleColorModeBtn.style.backgroundColor = '#6c757d';
        }
    });
}

// 요소 삭제 버튼
const deleteElementBtn = document.getElementById('delete-element');
if (deleteElementBtn) {
    deleteElementBtn.addEventListener('click', () => {
        if (confirm('선택한 요소를 삭제하시겠습니까?\n(삭제된 요소는 나중에 복원할 수 있습니다)')) {
            const success = deleteSelectedElement();
            if (success) {
                // 삭제된 요소 개수 표시
                const modelID = getCurrentModelID();
                if (modelID !== null && modelID !== undefined) {
                    const deleted = getDeletedElements(modelID);
                    console.log(`현재 삭제된 요소: ${deleted.length}개`);
                }
            }
        }
    });
}

// 삭제된 요소 복원 버튼
const restoreDeletedBtn = document.getElementById('restore-deleted');
if (restoreDeletedBtn) {
    restoreDeletedBtn.addEventListener('click', () => {
        const modelID = getCurrentModelID();
        if (!modelID && modelID !== 0) {
            alert('먼저 IFC 파일을 로드해주세요.');
            return;
        }

        const deleted = getDeletedElements(modelID);
        if (deleted.length === 0) {
            alert('복원할 삭제된 요소가 없습니다.');
            return;
        }

        if (confirm(`삭제된 ${deleted.length}개 요소를 모두 복원하시겠습니까?`)) {
            const restoredCount = restoreAllDeletedElements(modelID);
            alert(`${restoredCount}개 요소가 복원되었습니다.`);
        }
    });
}

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

// 자동 색상 적용 함수
function applyAutoColorToWalls() {
    const modelID = getCurrentModelID();
    if (!modelID && modelID !== 0) {
        alert('먼저 IFC 파일을 로드해주세요.');
        return;
    }

    // ExpressID 1898과 1926에 색상 적용
    const targetElements = [
        { expressID: 1898, color: '#a28181', opacity: 0.26 },
        { expressID: 1926, color: '#a28181', opacity: 0.26 }
    ];

    let successCount = 0;
    targetElements.forEach(({ expressID, color, opacity }) => {
        try {
            const success = applyColorToElement(modelID, expressID, color, opacity);
            if (success) {
                successCount++;
                console.log(`✓ 요소 ${expressID} 색상 적용 완료: ${color} (투명도: ${opacity * 100}%)`);
            }
        } catch (error) {
            console.error(`✗ 요소 ${expressID} 색상 적용 실패:`, error);
        }
    });

    if (successCount > 0) {
        console.log(`${successCount}개 요소에 색상이 적용되었습니다.`);
        // 상태 표시 업데이트
        const statusMsg = document.getElementById('sim-time-display');
        if (statusMsg) {
            const originalText = statusMsg.textContent;
            statusMsg.textContent = `✓ ${successCount}개 요소 색상 적용 완료`;
            statusMsg.style.color = '#28a745';
            setTimeout(() => {
                statusMsg.textContent = originalText;
                statusMsg.style.color = '#007bff';
            }, 3000);
        }
    } else {
        alert('색상 적용에 실패했습니다. ExpressID를 확인해주세요.');
    }
}

// 자동 색상 적용 버튼
const autoColorApplyBtn = document.getElementById('auto-color-apply-btn');
if (autoColorApplyBtn) {
    autoColorApplyBtn.addEventListener('click', () => {
        applyAutoColorToWalls();
    });
}

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
        // 재생 시 자동 색상 적용
        applyAutoColorToWalls();

        // 기존 재생 기능
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

// ==================== 모든 요소 색상 변경 기능 ====================

// 요소 목록 로드 버튼
const loadAllElementsBtn = document.getElementById('load-all-elements-btn');
if (loadAllElementsBtn) {
    loadAllElementsBtn.addEventListener('click', async() => {
        const modelID = getCurrentModelID();
        if (!modelID && modelID !== 0) {
            alert('먼저 IFC 파일을 로드해주세요.');
            return;
        }

        // 패널 표시
        const panel = document.getElementById('all-elements-panel');
        if (panel) {
            panel.style.display = 'block';
        }

        // 요소 목록 로드
        await loadAllElementsList(modelID);
    });
}

// 모든 색상 초기화 버튼
const resetAllColorsBtn = document.getElementById('reset-all-colors-btn');
if (resetAllColorsBtn) {
    resetAllColorsBtn.addEventListener('click', () => {
        const modelID = getCurrentModelID();
        if (!modelID && modelID !== 0) {
            alert('먼저 IFC 파일을 로드해주세요.');
            return;
        }

        if (confirm('모든 요소의 색상을 초기화하시겠습니까?')) {
            const success = resetAllElementColors(modelID);
            if (success) {
                alert('모든 색상이 초기화되었습니다.');
            } else {
                alert('색상 초기화 중 오류가 발생했습니다.');
            }
        }
    });
}