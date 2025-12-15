import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from '/js/IFCLoader.js';

// Three.js 장면 설정
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// 카메라 설정
const container = document.getElementById('viewer-container');
const width = container.clientWidth;
const height = container.clientHeight;
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

// 렌더러 설정
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// OrbitControls 설정
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 조명 추가
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// IFC Loader 설정
const ifcLoader = new IFCLoader();
ifcLoader.ifcManager.setWasmPath('/js/');

// 레이캐스터 및 마우스 설정
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 선택된 요소 정보
let selectedElement = null;
let selectedMesh = null;
let colorChangeMode = false;

// 삭제된 요소 추적 (복원을 위해)
let deletedElements = new Set();

// IFC 모델 정보
let currentModelID = null;
let ifcModel = null;

// IFC 모델 로드
async function loadIFCModel() {
    const url = '/files/T-LAB_1126.ifc';
    const fileName = 'T-LAB_1126.ifc';
    
    updateStatus('IFC 파일 로딩 중...');
    
    ifcLoader.load(
        url,
        async (loadedModel) => {
            scene.add(loadedModel);
            const modelID = loadedModel.modelID;
            
            // 전역 변수에 저장
            currentModelID = modelID;
            ifcModel = loadedModel;
            
            // 모델을 중앙에 배치
            const box = new THREE.Box3().setFromObject(loadedModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5;
            
            camera.position.set(
                center.x + cameraZ * 0.7,
                center.y + cameraZ * 0.7,
                center.z + cameraZ * 0.7
            );
            camera.lookAt(center);
            controls.target.copy(center);
            controls.update();
            
            updateStatus(`IFC 파일 로드 완료: ${fileName} (ModelID: ${modelID})`);
        },
        undefined,
        (error) => {
            console.error('IFC 파일 로드 실패:', error);
            updateStatus('IFC 파일 로드 실패: ' + error.message, true);
        }
    );
}

// 마우스 클릭 이벤트 처리
function onMouseClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    const meshes = [];
    scene.traverse((child) => {
        if (child.isMesh) {
            meshes.push(child);
        }
    });
    
    const intersects = raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
        const intersect = intersects[0];
        const object = intersect.object;
        
        if (object.modelID !== undefined) {
            try {
                const modelID = object.modelID;
                const expressID = ifcLoader.ifcManager.getExpressId(
                    object.geometry,
                    intersect.faceIndex
                );
                
                if (expressID !== undefined && expressID !== null) {
                    selectElement(modelID, expressID, object);
                    
                    // 색상 변경 모드일 때 자동으로 색상 적용
                    if (colorChangeMode) {
                        const color = document.getElementById('color-picker').value;
                        const opacitySlider = document.getElementById('opacity-slider');
                        const opacity = opacitySlider ? parseFloat(opacitySlider.value) / 100 : 1.0;
                        applyColorToElement(modelID, expressID, color, opacity);
                        updateStatus(`요소 ${expressID} 색상 변경: ${color} (투명도: ${(opacity * 100).toFixed(0)}%)`);
                    }
                }
            } catch (error) {
                console.error('요소 선택 실패:', error);
            }
        }
    } else {
        clearSelection();
    }
}

// 요소 선택
function selectElement(modelID, expressID, mesh) {
    selectedElement = { modelID, expressID };
    selectedMesh = mesh;
    if (!colorChangeMode) {
        updateStatus(`요소 선택: ExpressID ${expressID}`);
    }
}

// 선택 해제
function clearSelection() {
    selectedElement = null;
    selectedMesh = null;
    if (!colorChangeMode) {
        updateStatus('요소 선택 해제');
    }
}

// 색상 적용
function applyColorToElement(modelID, expressID, color, opacity = 1.0) {
    try {
        const isTransparent = opacity < 1.0;
        
        ifcLoader.ifcManager.createSubset({
            modelID,
            ids: [expressID],
            material: new THREE.MeshLambertMaterial({
                color: color,
                transparent: isTransparent,
                opacity: opacity
            }),
            scene,
            removePrevious: true
        });
    } catch (error) {
        console.error('색상 적용 실패:', error);
        updateStatus('색상 적용 실패: ' + error.message, true);
    }
}

// 색상 초기화
function resetElementColor(modelID, expressID) {
    try {
        ifcLoader.ifcManager.removeSubset(modelID, [expressID], scene);
        updateStatus(`요소 ${expressID} 색상 초기화`);
    } catch (error) {
        console.error('색상 초기화 실패:', error);
        updateStatus('색상 초기화 실패: ' + error.message, true);
    }
}

// 모든 색상 초기화
function resetAllColors() {
    const subsets = [];
    scene.traverse((child) => {
        if (child.userData && child.userData.subset) {
            subsets.push(child);
        }
    });
    
    subsets.forEach(subset => {
        scene.remove(subset);
        if (subset.geometry) subset.geometry.dispose();
        if (subset.material) {
            if (Array.isArray(subset.material)) {
                subset.material.forEach(mat => mat.dispose());
            } else {
                subset.material.dispose();
            }
        }
    });
    
    updateStatus(`모든 색상 초기화 완료 (${subsets.length}개 서브셋 제거)`);
}

// ExpressID로 메시 찾기
function findMeshByExpressID(modelID, expressID) {
    let ifcModel = null;
    scene.traverse((child) => {
        if (child.modelID === modelID) {
            ifcModel = child;
        }
    });
    
    if (!ifcModel) {
        console.warn(`ModelID ${modelID}를 찾을 수 없습니다.`);
        return null;
    }
    
    // geometry의 expressID 속성에서 찾기
    let foundMesh = null;
    
    ifcModel.traverse((child) => {
        if (foundMesh) return; // 이미 찾았으면 중단
        
        if (child.isMesh && child.geometry) {
            const attributes = child.geometry.attributes;
            const idAttr = attributes && attributes.expressID;
            if (idAttr) {
                const idArray = idAttr.array;
                for (let i = 0; i < idArray.length; i++) {
                    if (idArray[i] === expressID) {
                        foundMesh = child;
                        break;
                    }
                }
            }
            
            // 또는 geometry.groups에서 찾기
            if (!foundMesh && child.geometry.groups) {
                for (let group of child.geometry.groups) {
                    // group을 통한 ExpressID 찾기 시도
                }
            }
        }
    });
    
    return foundMesh;
}

// 요소 삭제 함수
function deleteSelectedElement() {
    if (!selectedElement) {
        updateStatus('먼저 요소를 선택해주세요', true);
        return;
    }
    
    const { modelID, expressID } = selectedElement;
    
    try {
        const mesh = findMeshByExpressID(modelID, expressID);
        if (mesh) {
            mesh.visible = false;
            deletedElements.add(expressID);
            updateStatus(`요소 ${expressID} 삭제 완료`);
            clearSelection();
        } else {
            updateStatus('요소를 찾을 수 없습니다', true);
        }
    } catch (error) {
        console.error('요소 삭제 실패:', error);
        updateStatus('요소 삭제 실패: ' + error.message, true);
    }
}

// 모든 삭제된 요소 복원
function restoreAllDeletedElements() {
    if (deletedElements.size === 0) {
        updateStatus('복원할 삭제된 요소가 없습니다');
        return;
    }
    
    let restoredCount = 0;
    let ifcModel = null;
    
    // IFC 모델 찾기
    scene.traverse((child) => {
        if (child.modelID !== undefined && child.modelID !== null) {
            ifcModel = child;
        }
    });
    
    if (!ifcModel) {
        updateStatus('IFC 모델을 찾을 수 없습니다', true);
        return;
    }
    
    const modelID = ifcModel.modelID;
    
    deletedElements.forEach(expressID => {
        try {
            const mesh = findMeshByExpressID(modelID, expressID);
            if (mesh) {
                mesh.visible = true;
                restoredCount++;
            }
        } catch (error) {
            console.error(`요소 ${expressID} 복원 실패:`, error);
        }
    });
    
    deletedElements.clear();
    updateStatus(`${restoredCount}개 요소 복원 완료`);
}

// 상태 업데이트
function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ff6b6b' : 'white';
    }
}

// 색상 변경 모드 토글
function toggleColorChangeMode() {
    colorChangeMode = !colorChangeMode;
    const toggleBtn = document.getElementById('color-mode-toggle');
    if (toggleBtn) {
        if (colorChangeMode) {
            toggleBtn.textContent = '색상 변경 모드: ON';
            toggleBtn.className = 'mode-toggle active';
            updateStatus('색상 변경 모드 활성화 - 요소를 클릭하면 색상이 변경됩니다');
        } else {
            toggleBtn.textContent = '색상 변경 모드: OFF';
            toggleBtn.className = 'mode-toggle inactive';
            updateStatus('색상 변경 모드 비활성화 - 요소를 클릭하면 선택만 됩니다');
        }
    }
}

// 투명도 슬라이더 이벤트
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

if (opacitySlider && opacityValue) {
    opacitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        opacityValue.textContent = `${value}%`;
    });
}

// 이벤트 리스너
renderer.domElement.addEventListener('click', onMouseClick);

document.getElementById('color-mode-toggle').addEventListener('click', toggleColorChangeMode);

document.getElementById('reset-selected-color').addEventListener('click', () => {
    if (selectedElement) {
        resetElementColor(selectedElement.modelID, selectedElement.expressID);
    } else {
        updateStatus('먼저 요소를 선택해주세요', true);
    }
});

document.getElementById('reset-all-colors').addEventListener('click', () => {
    if (confirm('모든 요소의 색상을 초기화하시겠습니까?')) {
        resetAllColors();
    }
});

document.getElementById('delete-element').addEventListener('click', () => {
    if (confirm('선택한 요소를 삭제하시겠습니까?\n(삭제된 요소는 나중에 복원할 수 있습니다)')) {
        deleteSelectedElement();
    }
});

document.getElementById('restore-deleted').addEventListener('click', () => {
    if (deletedElements.size === 0) {
        alert('복원할 삭제된 요소가 없습니다.');
        return;
    }
    
    if (confirm(`삭제된 ${deletedElements.size}개 요소를 모두 복원하시겠습니까?`)) {
        restoreAllDeletedElements();
    }
});

// 자동 투명도 슬라이더 이벤트
const autoOpacitySlider = document.getElementById('auto-opacity-slider');
const autoOpacityValue = document.getElementById('auto-opacity-value');

if (autoOpacitySlider && autoOpacityValue) {
    autoOpacitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        autoOpacityValue.textContent = `${value}%`;
    });
}

// 왼쪽/오른쪽 벽 자동 색상 적용 함수
async function applyLeftRightWallColors() {
    if (!currentModelID && currentModelID !== 0) {
        updateStatus('먼저 IFC 파일을 로드해주세요', true);
        return;
    }
    
    const leftColor = document.getElementById('left-wall-color').value;
    const rightColor = document.getElementById('right-wall-color').value;
    const opacity = autoOpacitySlider ? parseFloat(autoOpacitySlider.value) / 100 : 0.26;
    
    updateStatus('벽 정보 분석 중...');
    
    try {
        // 모든 벽 가져오기
        const walls = await ifcLoader.ifcManager.byType(currentModelID, 'IFCWALLSTANDARDCASE');
        
        if (!walls || walls.length === 0) {
            updateStatus('벽을 찾을 수 없습니다', true);
            return;
        }
        
        // 각 벽의 위치 정보 가져오기
        const wallPositions = [];
        for (const expressID of walls) {
            try {
                const props = await ifcLoader.ifcManager.getItemProperties(currentModelID, expressID);
                
                // ObjectPlacement에서 위치 추출 시도
                let position = { x: 0, y: 0, z: 0 };
                
                // 메시에서 위치 가져오기
                const mesh = findMeshByExpressID(currentModelID, expressID);
                if (mesh) {
                    position = {
                        x: mesh.position.x,
                        y: mesh.position.y,
                        z: mesh.position.z
                    };
                }
                
                wallPositions.push({
                    expressID: expressID,
                    position: position,
                    name: props.Name || `ExpressID: ${expressID}`
                });
            } catch (error) {
                console.warn(`벽 ${expressID} 정보 가져오기 실패:`, error);
                wallPositions.push({
                    expressID: expressID,
                    position: { x: 0, y: 0, z: 0 },
                    name: `ExpressID: ${expressID}`
                });
            }
        }
        
        // X 좌표 기준으로 정렬
        wallPositions.sort((a, b) => a.position.x - b.position.x);
        
        // 중간값을 기준으로 왼쪽/오른쪽 구분
        const midIndex = Math.floor(wallPositions.length / 2);
        const leftWalls = wallPositions.slice(0, midIndex);
        const rightWalls = wallPositions.slice(midIndex);
        
        // 왼쪽 벽에 색상 적용
        let leftCount = 0;
        for (const wall of leftWalls) {
            try {
                applyColorToElement(currentModelID, wall.expressID, leftColor, opacity);
                leftCount++;
            } catch (error) {
                console.error(`왼쪽 벽 ${wall.expressID} 색상 적용 실패:`, error);
            }
        }
        
        // 오른쪽 벽에 색상 적용
        let rightCount = 0;
        for (const wall of rightWalls) {
            try {
                applyColorToElement(currentModelID, wall.expressID, rightColor, opacity);
                rightCount++;
            } catch (error) {
                console.error(`오른쪽 벽 ${wall.expressID} 색상 적용 실패:`, error);
            }
        }
        
        updateStatus(`왼쪽 벽 ${leftCount}개, 오른쪽 벽 ${rightCount}개에 색상 적용 완료`);
        console.log(`왼쪽 벽: ${leftColor} (${leftCount}개), 오른쪽 벽: ${rightColor} (${rightCount}개)`);
        
    } catch (error) {
        console.error('벽 색상 적용 실패:', error);
        updateStatus('벽 색상 적용 실패: ' + error.message, true);
    }
}

// 시뮬레이션 색상 적용 함수 (ExpressID 1898, 1926)
function applySimulationColors() {
    if (!currentModelID && currentModelID !== 0) {
        updateStatus('먼저 IFC 파일을 로드해주세요', true);
        return;
    }
    
    const leftColor = document.getElementById('left-wall-color').value;
    const rightColor = document.getElementById('right-wall-color').value;
    const opacity = autoOpacitySlider ? parseFloat(autoOpacitySlider.value) / 100 : 0.26;
    
    // ExpressID 1898과 1926에 색상 적용
    const targetElements = [
        { expressID: 1898, color: leftColor, opacity: opacity },
        { expressID: 1926, color: rightColor, opacity: opacity }
    ];
    
    let successCount = 0;
    targetElements.forEach(({ expressID, color, opacity }) => {
        try {
            applyColorToElement(currentModelID, expressID, color, opacity);
            successCount++;
            console.log(`✓ 요소 ${expressID} 색상 적용 완료: ${color} (투명도: ${opacity * 100}%)`);
        } catch (error) {
            console.error(`✗ 요소 ${expressID} 색상 적용 실패:`, error);
        }
    });
    
    if (successCount > 0) {
        updateStatus(`시뮬레이션 색상 적용 완료: 요소 1898(${leftColor}), 1926(${rightColor})`);
    } else {
        updateStatus('색상 적용에 실패했습니다. ExpressID를 확인해주세요', true);
    }
}

// 이벤트 리스너 추가
document.getElementById('auto-apply-left-right-colors').addEventListener('click', () => {
    applyLeftRightWallColors();
});

document.getElementById('auto-apply-simulation-colors').addEventListener('click', () => {
    applySimulationColors();
});

// ==================== 색상 진하기 시뮬레이션 ====================

// 시뮬레이션 상태 관리
let simulationState = {
    isPlaying: false,
    isPaused: false,
    currentFrame: 0,
    totalFrames: 10,
    animationId: null,
    frames: [],
    playbackSpeed: 1.0,
    lastFrameTime: 0
};

// 색상 보간 함수 (RGB)
function interpolateColor(color1, color2, t) {
    // t는 0.0 ~ 1.0 사이의 값
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 시뮬레이션 프레임 데이터 생성
function generateSimulationFrames() {
    const startColor = document.getElementById('sim-start-color').value;
    const endColor = document.getElementById('sim-end-color').value;
    const opacity = parseFloat(document.getElementById('sim-opacity-slider').value) / 100;
    
    const frames = [];
    for (let i = 0; i < simulationState.totalFrames; i++) {
        const t = i / (simulationState.totalFrames - 1); // 0.0 ~ 1.0
        const leftColor = interpolateColor(startColor, endColor, t);
        const rightColor = interpolateColor(startColor, endColor, t);
        
        frames.push({
            frame: i,
            leftColor: leftColor,
            rightColor: rightColor,
            opacity: opacity,
            intensity: Math.round(t * 100) // 진하기 정도 (0~100%)
        });
    }
    
    simulationState.frames = frames;
    return frames;
}

// 특정 프레임의 색상 적용
function applySimulationFrame(frameIndex) {
    if (!currentModelID && currentModelID !== 0) {
        updateStatus('먼저 IFC 파일을 로드해주세요', true);
        return;
    }
    
    if (frameIndex < 0 || frameIndex >= simulationState.frames.length) {
        return;
    }
    
    const frame = simulationState.frames[frameIndex];
    
    // ExpressID 1898 (왼쪽 벽)에 색상 적용
    try {
        applyColorToElement(currentModelID, 1898, frame.leftColor, frame.opacity);
    } catch (error) {
        console.error(`왼쪽 벽 색상 적용 실패:`, error);
    }
    
    // ExpressID 1926 (오른쪽 벽)에 색상 적용
    try {
        applyColorToElement(currentModelID, 1926, frame.rightColor, frame.opacity);
    } catch (error) {
        console.error(`오른쪽 벽 색상 적용 실패:`, error);
    }
    
    // UI 업데이트
    updateSimulationFrameDisplay(frameIndex);
}

// 시뮬레이션 프레임 정보 표시 업데이트
function updateSimulationFrameDisplay(frameIndex) {
    if (frameIndex < 0 || frameIndex >= simulationState.frames.length) {
        return;
    }
    
    const frame = simulationState.frames[frameIndex];
    
    // 프레임 번호 표시
    document.getElementById('sim-current-frame').textContent = frameIndex + 1;
    document.getElementById('sim-frame-display').textContent = `프레임: ${frameIndex + 1}/${simulationState.totalFrames}`;
    
    // 색상 정보 표시
    const leftColorDisplay = document.getElementById('sim-left-color-display');
    leftColorDisplay.textContent = frame.leftColor;
    leftColorDisplay.style.color = frame.leftColor;
    
    const rightColorDisplay = document.getElementById('sim-right-color-display');
    rightColorDisplay.textContent = frame.rightColor;
    rightColorDisplay.style.color = frame.rightColor;
    
    // 진하기 표시
    document.getElementById('sim-intensity-display').textContent = `${frame.intensity}%`;
    
    // 슬라이더 업데이트 (재생 중이 아닐 때만)
    if (!simulationState.isPlaying) {
        const slider = document.getElementById('sim-frame-slider');
        if (slider) {
            slider.value = frameIndex;
        }
    }
}

// 시뮬레이션 재생
function playSimulation() {
    if (simulationState.isPlaying) return;
    
    // 프레임 데이터 생성
    if (simulationState.frames.length === 0) {
        generateSimulationFrames();
    }
    
    simulationState.isPlaying = true;
    simulationState.isPaused = false;
    simulationState.lastFrameTime = performance.now();
    
    // UI 업데이트
    document.getElementById('sim-play-btn').disabled = true;
    document.getElementById('sim-pause-btn').disabled = false;
    document.getElementById('sim-stop-btn').disabled = false;
    document.getElementById('sim-frame-slider').disabled = true;
    
    // 애니메이션 시작
    animateSimulation();
}

// 시뮬레이션 애니메이션 루프
const frameInterval = 1000; // 1초마다 프레임 변경 (1000ms)

function animateSimulation() {
    if (!simulationState.isPlaying) return;
    
    const now = performance.now();
    
    if (now - simulationState.lastFrameTime >= frameInterval / simulationState.playbackSpeed) {
        simulationState.currentFrame++;
        
        if (simulationState.currentFrame >= simulationState.totalFrames) {
            // 마지막 프레임 도달 시 정지
            stopSimulation();
            return;
        }
        
        applySimulationFrame(simulationState.currentFrame);
        simulationState.lastFrameTime = now;
    }
    
    simulationState.animationId = requestAnimationFrame(animateSimulation);
}

// 시뮬레이션 일시정지
function pauseSimulation() {
    simulationState.isPlaying = false;
    simulationState.isPaused = true;
    
    if (simulationState.animationId) {
        cancelAnimationFrame(simulationState.animationId);
        simulationState.animationId = null;
    }
    
    // UI 업데이트
    document.getElementById('sim-play-btn').disabled = false;
    document.getElementById('sim-pause-btn').disabled = true;
    document.getElementById('sim-frame-slider').disabled = false;
}

// 시뮬레이션 정지
function stopSimulation() {
    simulationState.isPlaying = false;
    simulationState.isPaused = false;
    simulationState.currentFrame = 0;
    
    if (simulationState.animationId) {
        cancelAnimationFrame(simulationState.animationId);
        simulationState.animationId = null;
    }
    
    // 첫 프레임으로 이동
    if (simulationState.frames.length > 0) {
        applySimulationFrame(0);
    }
    
    // UI 업데이트
    document.getElementById('sim-play-btn').disabled = false;
    document.getElementById('sim-pause-btn').disabled = false;
    document.getElementById('sim-stop-btn').disabled = true;
    document.getElementById('sim-frame-slider').disabled = false;
}

// 시뮬레이션 이벤트 리스너 초기화
function initSimulationControls() {
    // 투명도 슬라이더
    const simOpacitySlider = document.getElementById('sim-opacity-slider');
    const simOpacityValue = document.getElementById('sim-opacity-value');
    if (simOpacitySlider && simOpacityValue) {
        simOpacitySlider.addEventListener('input', (e) => {
            const value = e.target.value;
            simOpacityValue.textContent = `${value}%`;
            // 프레임 데이터 재생성
            generateSimulationFrames();
            // 재생 중이 아니면 현재 프레임 다시 적용
            if (!simulationState.isPlaying) {
                applySimulationFrame(simulationState.currentFrame);
            }
        });
    }
    
    // 시작 색상 변경 시 프레임 데이터 재생성
    const simStartColor = document.getElementById('sim-start-color');
    if (simStartColor) {
        simStartColor.addEventListener('change', () => {
            generateSimulationFrames();
            if (!simulationState.isPlaying) {
                applySimulationFrame(simulationState.currentFrame);
            }
        });
    }
    
    // 끝 색상 변경 시 프레임 데이터 재생성
    const simEndColor = document.getElementById('sim-end-color');
    if (simEndColor) {
        simEndColor.addEventListener('change', () => {
            generateSimulationFrames();
            if (!simulationState.isPlaying) {
                applySimulationFrame(simulationState.currentFrame);
            }
        });
    }
    
    // 프레임 슬라이더
    const frameSlider = document.getElementById('sim-frame-slider');
    if (frameSlider) {
        frameSlider.addEventListener('input', (e) => {
            if (!simulationState.isPlaying) {
                const frameIndex = parseInt(e.target.value);
                simulationState.currentFrame = frameIndex;
                applySimulationFrame(frameIndex);
            }
        });
    }
    
    // 재생/일시정지/정지 버튼
    const simPlayBtn = document.getElementById('sim-play-btn');
    if (simPlayBtn) {
        simPlayBtn.addEventListener('click', playSimulation);
    }
    
    const simPauseBtn = document.getElementById('sim-pause-btn');
    if (simPauseBtn) {
        simPauseBtn.addEventListener('click', pauseSimulation);
    }
    
    const simStopBtn = document.getElementById('sim-stop-btn');
    if (simStopBtn) {
        simStopBtn.addEventListener('click', stopSimulation);
    }
    
    // 초기 프레임 데이터 생성
    generateSimulationFrames();
    applySimulationFrame(0);
}

// 윈도우 리사이즈 처리
function onWindowResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
window.addEventListener('resize', onWindowResize);

// 애니메이션 루프
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// 초기화
loadIFCModel();
animate();

// 시뮬레이션 컨트롤 초기화 (DOM 로드 후)
// 모듈이 로드될 때 DOM이 이미 준비되어 있을 수 있으므로 약간의 지연 후 초기화
setTimeout(() => {
    if (typeof initSimulationControls === 'function') {
        initSimulationControls();
    }
}, 500);

