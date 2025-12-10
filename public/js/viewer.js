import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// 로컬에 설치된 web-ifc-three 사용
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

// OrbitControls 설정 (카메라 회전/줌/패닝)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // 부드러운 감속 효과
controls.dampingFactor = 0.05;
controls.enablePan = true; // 패닝 활성화 (우클릭 드래그 또는 Ctrl+좌클릭 드래그)
controls.enableZoom = true; // 줌 활성화 (마우스 휠)
controls.enableRotate = true; // 회전 활성화 (좌클릭 드래그)
controls.screenSpacePanning = false; // 화면 공간 패닝 비활성화
controls.minDistance = 1; // 최소 줌 거리
controls.maxDistance = 500; // 최대 줌 거리
controls.target.set(0, 0, 0); // 초기 타겟 설정

// 조명 추가
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// IFC Loader 설정
const ifcLoader = new IFCLoader();
// 로컬 wasm 파일 경로 설정
ifcLoader.ifcManager.setWasmPath('/js/');

// 레이캐스터 및 마우스 설정
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 선택된 요소 정보
let selectedElement = null;
let selectedMesh = null;
let originalMaterial = null;
let highlightMesh = null; // 하이라이트용 메시

// IFC 모델 캐시 (ExpressID로 빠르게 찾기 위해)
let ifcModels = new Map(); // modelID -> IFCModel

// 드래그 관련 변수
let isDragging = false;
let dragStart = new THREE.Vector2();
let dragStartPosition = new THREE.Vector3();
let dragPlane = new THREE.Plane();
let dragIntersection = new THREE.Vector3();
let mouseDownTime = 0;
let mouseDownPosition = new THREE.Vector2();

// 마우스 클릭 이벤트 처리
function onMouseClick(event) {
    console.log('=== 클릭 이벤트 발생 ===');
    console.log('isDragging:', isDragging);

    // 요소 선택을 위해 OrbitControls 비활성화
    controls.enabled = false;

    // 드래그 중이면 클릭 이벤트 무시
    if (isDragging) {
        console.log('드래그 중이므로 클릭 무시');
        controls.enabled = true;
        return;
    }

    // 짧은 클릭인지 확인 (300ms 이내, 15px 이내 이동)
    // 마우스가 살짝 움직여도 클릭으로 인정하도록 임계값 증가
    const clickDuration = Date.now() - mouseDownTime;
    const clickDistance = Math.sqrt(
        Math.pow(event.clientX - mouseDownPosition.x, 2) +
        Math.pow(event.clientY - mouseDownPosition.y, 2)
    );

    console.log('클릭 지속 시간:', clickDuration, 'ms');
    console.log('클릭 이동 거리:', clickDistance, 'px');

    // 클릭 판단: 300ms 이내이고 15px 이내 이동이면 클릭으로 간주
    if (clickDuration > 300 || clickDistance > 15) {
        console.log('드래그로 간주하여 클릭 무시 (지속시간:', clickDuration, 'ms, 이동거리:', clickDistance.toFixed(2), 'px)');
        // 드래그로 간주하지만 OrbitControls는 다시 활성화
        controls.enabled = true;
        return; // 드래그로 간주
    }

    console.log('클릭으로 인정됨');

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    console.log('마우스 정규화 좌표:', mouse.x, mouse.y);

    raycaster.setFromCamera(mouse, camera);

    // 모든 메시를 검사
    const meshes = [];
    scene.traverse((child) => {
        if (child.isMesh) {
            meshes.push(child);
        }
    });

    console.log('검사할 메시 개수:', meshes.length);

    const intersects = raycaster.intersectObjects(meshes, true);

    console.log('교차된 객체 개수:', intersects.length);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const object = intersect.object;

        console.log('클릭된 객체:', object);
        console.log('modelID:', object.modelID);
        console.log('faceIndex:', intersect.faceIndex);

        // IFC 모델인지 확인
        if (object.modelID !== undefined) {
            try {
                const modelID = object.modelID;
                const expressID = ifcLoader.ifcManager.getExpressId(
                    object.geometry,
                    intersect.faceIndex
                );

                console.log('선택된 ExpressID:', expressID);

                if (expressID !== undefined && expressID !== null) {
                    selectElement(modelID, expressID, object);
                } else {
                    console.warn('ExpressID를 가져올 수 없습니다.');
                    // ExpressID가 없어도 메시 자체는 선택 가능하도록
                    // 임시 ExpressID 사용
                    selectElement(modelID, -1, object);
                }
            } catch (error) {
                console.error('요소 선택 중 오류:', error);
                // 오류가 발생해도 메시는 선택 가능하도록
                if (object.modelID !== undefined) {
                    selectElement(object.modelID, -1, object);
                }
            }
        } else {
            console.log('IFC 모델이 아닙니다. 직접 메시 선택 시도...');
            console.log('객체 타입:', object.constructor.name);
            console.log('객체 부모:', object.parent);

            // IFC 모델이 아니어도 메시 자체는 선택 가능하도록
            // 부모에서 IFC 모델 찾기
            let parent = object.parent;
            let found = false;
            while (parent && !found) {
                console.log('부모 확인:', parent.constructor.name, 'modelID:', parent.modelID);
                if (parent.modelID !== undefined) {
                    try {
                        const modelID = parent.modelID;
                        console.log('부모에서 IFC 모델 발견, 선택 시도...');
                        selectElement(modelID, -1, object);
                        found = true;
                        break;
                    } catch (error) {
                        console.error('부모 모델 선택 중 오류:', error);
                    }
                }
                parent = parent.parent;
            }

            // 부모에서도 찾지 못한 경우, 직접 메시 선택
            if (!found) {
                console.log('IFC 모델을 찾을 수 없음. 메시 직접 선택 시도...');
                // 씬에서 IFC 모델 찾기
                scene.traverse((child) => {
                    if (child.modelID !== undefined && !found) {
                        try {
                            console.log('씬에서 IFC 모델 발견:', child.modelID);
                            selectElement(child.modelID, -1, object);
                            found = true;
                        } catch (error) {
                            console.error('씬 모델 선택 중 오류:', error);
                        }
                    }
                });
            }

            if (!found) {
                console.warn('요소를 선택할 수 없습니다. IFC 모델을 찾을 수 없습니다.');
            }
        }
    } else {
        // 아무것도 선택되지 않음
        console.log('아무것도 선택되지 않았습니다.');
        console.log('메시 개수:', meshes.length);
        console.log('레이캐스터 방향:', raycaster.ray.direction);
        console.log('레이캐스터 원점:', raycaster.ray.origin);
        clearSelection();
    }

    // 클릭 처리 완료 후 OrbitControls 다시 활성화
    setTimeout(() => {
        controls.enabled = true;
    }, 100);
}

// 요소 선택
function selectElement(modelID, expressID, mesh) {
    console.log('=== selectElement 함수 호출 ===');
    console.log('modelID:', modelID);
    console.log('expressID:', expressID);
    console.log('mesh:', mesh);

    // 이전 선택 해제
    clearSelection();

    selectedElement = { modelID, expressID };
    selectedMesh = mesh;

    console.log('selectedElement 설정 완료:', selectedElement);
    console.log('selectedMesh 설정 완료:', selectedMesh);

    // 원본 재질 저장 (안전하게 처리)
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            originalMaterial = mesh.material.map(mat => mat.clone ? mat.clone() : mat);
        } else if (mesh.material.clone && typeof mesh.material.clone === 'function') {
            originalMaterial = mesh.material.clone();
        } else {
            originalMaterial = mesh.material;
        }
    }

    // 선택된 요소 하이라이트 (윤곽선 효과)
    try {
        // 기존 하이라이트 제거
        if (highlightMesh) {
            scene.remove(highlightMesh);
            highlightMesh = null;
        }

        // 하이라이트 메시 생성 (윤곽선 효과를 위한 약간 큰 복사본)
        const highlightGeometry = mesh.geometry.clone();
        highlightMesh = new THREE.Mesh(
            highlightGeometry,
            new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                side: THREE.BackSide,
                transparent: true,
                opacity: 0.3
            })
        );
        highlightMesh.position.copy(mesh.position);
        highlightMesh.rotation.copy(mesh.rotation);
        highlightMesh.scale.multiplyScalar(1.02); // 약간 크게
        scene.add(highlightMesh);
    } catch (error) {
        console.warn('하이라이트 생성 실패:', error);
    }

    // 선택된 요소 정보 로그 출력 및 웹페이지 표시
    console.log('=== 요소 선택 완료 ===');
    console.log('ExpressID:', expressID);
    console.log('ModelID:', modelID);
    console.log('메시 위치:', mesh.position);
    console.log('메시 회전:', mesh.rotation);
    console.log('메시 크기:', mesh.scale);
    console.log('selectedElement 최종 확인:', selectedElement);
    console.log('selectedMesh 최종 확인:', selectedMesh);

    // 웹페이지에 정보 표시
    updateElementInfo(modelID, expressID, mesh);

    // 위치 입력 필드에 현재 위치 반영
    if (mesh.position) {
        const posXInput = document.getElementById('pos-x');
        const posYInput = document.getElementById('pos-y');
        const posZInput = document.getElementById('pos-z');
        if (posXInput) posXInput.value = mesh.position.x.toFixed(2);
        if (posYInput) posYInput.value = mesh.position.y.toFixed(2);
        if (posZInput) posZInput.value = mesh.position.z.toFixed(2);
    }

    // 선택 상태 표시 업데이트
    const colorStatus = document.getElementById('color-status');
    if (colorStatus) {
        colorStatus.textContent = `✓ 요소가 선택되었습니다 (ExpressID: ${expressID})`;
        colorStatus.style.color = '#28a745';
        console.log('색상 상태 표시 업데이트 완료');
    } else {
        console.warn('color-status 요소를 찾을 수 없습니다');
    }

    // 선택된 요소 ID 표시 강제 업데이트
    const selectedIdEl = document.getElementById('selected-element-id');
    if (selectedIdEl) {
        selectedIdEl.textContent = `선택된 요소: ExpressID ${expressID}`;
        selectedIdEl.style.color = '#007bff';
        selectedIdEl.style.fontWeight = 'bold';
        console.log('선택된 요소 ID 표시 업데이트 완료');
    } else {
        console.warn('selected-element-id 요소를 찾을 수 없습니다');
    }

    // 선택 상태 확인용 로그
    console.log('요소 선택 완료 - selectedElement:', selectedElement);
    console.log('요소 선택 완료 - selectedMesh:', selectedMesh);
    console.log('웹페이지 업데이트 완료');

    // 속성 조회
    ifcLoader.ifcManager.getItemProperties(modelID, expressID)
        .then((properties) => {
            // 모든 속성 변수를 JSON으로 표시
            const propertiesText = JSON.stringify(properties, null, 2);
            document.getElementById('element-properties').textContent = propertiesText;

            // 편집 가능한 속성 UI 생성
            createPropertyEditor(properties, modelID, expressID);

            // 콘솔에도 출력하여 디버깅 가능하도록
            console.log('선택된 요소 속성:', properties);
            console.log('==================');
        })
        .catch((error) => {
            console.error('속성 조회 실패:', error);
            document.getElementById('element-properties').textContent =
                `오류: ${error.message}`;
        });
}

// 모델 정보를 웹페이지에 업데이트
function updateModelInfo(fileName, modelID, center, size) {
    const fileNameEl = document.getElementById('model-file-name');
    const modelIdEl = document.getElementById('model-id');
    const centerEl = document.getElementById('model-center');
    const sizeEl = document.getElementById('model-size');
    const statusEl = document.getElementById('model-load-status');

    if (fileNameEl) fileNameEl.textContent = fileName;
    if (modelIdEl) modelIdEl.textContent = modelID;
    if (centerEl) {
        centerEl.textContent = `X: ${center.x.toFixed(2)}, Y: ${center.y.toFixed(2)}, Z: ${center.z.toFixed(2)}`;
    }
    if (sizeEl) {
        sizeEl.textContent = `X: ${size.x.toFixed(2)}, Y: ${size.y.toFixed(2)}, Z: ${size.z.toFixed(2)}`;
    }
    if (statusEl) statusEl.textContent = '로드 완료';
}

// 요소 정보를 웹페이지에 업데이트
function updateElementInfo(modelID, expressID, mesh) {
    document.getElementById('selected-element-id').textContent = `선택된 요소: ExpressID ${expressID}`;
    document.getElementById('info-express-id').textContent = expressID;
    document.getElementById('info-model-id').textContent = modelID;
    document.getElementById('info-position').textContent =
        `X: ${mesh.position.x.toFixed(2)}, Y: ${mesh.position.y.toFixed(2)}, Z: ${mesh.position.z.toFixed(2)}`;
    document.getElementById('info-rotation').textContent =
        `X: ${(mesh.rotation.x * 180 / Math.PI).toFixed(2)}°, Y: ${(mesh.rotation.y * 180 / Math.PI).toFixed(2)}°, Z: ${(mesh.rotation.z * 180 / Math.PI).toFixed(2)}°`;
    document.getElementById('info-scale').textContent =
        `X: ${mesh.scale.x.toFixed(2)}, Y: ${mesh.scale.y.toFixed(2)}, Z: ${mesh.scale.z.toFixed(2)}`;
}

// 드래그 정보를 웹페이지에 업데이트
function updateDragInfo(status, startPos, currentPos, distance) {
    document.getElementById('drag-status').textContent = status;
    if (startPos) {
        document.getElementById('drag-start-pos').textContent =
            `X: ${startPos.x.toFixed(2)}, Y: ${startPos.y.toFixed(2)}, Z: ${startPos.z.toFixed(2)}`;
    } else {
        document.getElementById('drag-start-pos').textContent = '-';
    }
    if (currentPos) {
        document.getElementById('drag-current-pos').textContent =
            `X: ${currentPos.x.toFixed(2)}, Y: ${currentPos.y.toFixed(2)}, Z: ${currentPos.z.toFixed(2)}`;
    } else {
        document.getElementById('drag-current-pos').textContent = '-';
    }
    if (distance !== undefined && distance !== null) {
        if (typeof distance === 'number') {
            document.getElementById('drag-distance').textContent = `${distance.toFixed(2)}`;
        } else {
            document.getElementById('drag-distance').textContent = String(distance);
        }
    } else {
        document.getElementById('drag-distance').textContent = '-';
    }
}

// 편집 가능한 속성 UI 생성
function createPropertyEditor(properties, modelID, expressID) {
    const editorDiv = document.getElementById('editable-properties');
    const saveBtn = document.getElementById('save-properties');
    editorDiv.innerHTML = '';

    if (!properties || Object.keys(properties).length === 0) {
        editorDiv.innerHTML = '<p>편집 가능한 속성이 없습니다.</p>';
        saveBtn.style.display = 'none';
        return;
    }

    // 주요 속성만 편집 가능하게 표시
    const editableKeys = ['Name', 'GlobalId', 'Description', 'ObjectType', 'Tag'];
    let hasEditable = false;

    editableKeys.forEach(key => {
        if (properties[key] !== undefined && properties[key] !== null) {
            hasEditable = true;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'property-item';

            const label = document.createElement('label');
            label.textContent = key + ':';
            label.setAttribute('for', `prop-${key}`);

            const input = document.createElement('input');
            input.type = 'text';
            input.id = `prop-${key}`;
            input.value = String(properties[key]);
            input.dataset.key = key;

            itemDiv.appendChild(label);
            itemDiv.appendChild(input);
            editorDiv.appendChild(itemDiv);
        }
    });

    if (hasEditable) {
        saveBtn.style.display = 'block';
        saveBtn.onclick = () => savePropertyChanges(modelID, expressID);
    } else {
        saveBtn.style.display = 'none';
        editorDiv.innerHTML = '<p>이 요소의 속성은 편집할 수 없습니다. (읽기 전용)</p>';
    }
}

// 속성 변경사항 저장
function savePropertyChanges(modelID, expressID) {
    const inputs = document.querySelectorAll('#editable-properties input');
    const changes = {};

    inputs.forEach(input => {
        const key = input.dataset.key;
        const newValue = input.value;
        changes[key] = newValue;
    });

    console.log('=== 속성 변경 시도 ===');
    console.log('변경할 속성:', changes);

    // web-ifc는 속성을 직접 수정하는 API가 제한적이므로,
    // 변경사항을 로컬에 저장하고 표시만 업데이트
    // 실제 IFC 파일 수정은 서버 측에서 처리해야 함

    // UI 업데이트
    ifcLoader.ifcManager.getItemProperties(modelID, expressID)
        .then((properties) => {
            // 변경사항 반영
            Object.assign(properties, changes);

            // JSON 업데이트
            const propertiesText = JSON.stringify(properties, null, 2);
            document.getElementById('element-properties').textContent = propertiesText;

            console.log('속성 변경 완료 (로컬):', changes);
            console.log('참고: 실제 IFC 파일 수정은 서버 측에서 처리해야 합니다.');
            alert('속성이 변경되었습니다. (로컬 변경사항 - 실제 파일 수정은 서버 측에서 처리 필요)');
        })
        .catch((error) => {
            console.error('속성 업데이트 실패:', error);
            alert('속성 업데이트에 실패했습니다: ' + error.message);
        });
}

// 선택 해제
function clearSelection() {
    if (selectedMesh && originalMaterial) {
        if (Array.isArray(originalMaterial)) {
            selectedMesh.material = originalMaterial.map(mat => mat.clone ? mat.clone() : mat);
        } else {
            selectedMesh.material = originalMaterial;
        }
    }

    // 하이라이트 제거
    if (highlightMesh) {
        scene.remove(highlightMesh);
        highlightMesh = null;
    }

    selectedElement = null;
    selectedMesh = null;
    originalMaterial = null;
    isDragging = false;

    document.getElementById('selected-element-id').textContent = '선택된 요소: 없음';
    document.getElementById('element-properties').textContent = '없음';
    document.getElementById('info-express-id').textContent = '-';
    document.getElementById('info-model-id').textContent = '-';
    document.getElementById('info-position').textContent = 'X: -, Y: -, Z: -';
    document.getElementById('info-rotation').textContent = 'X: -, Y: -, Z: -';
    document.getElementById('info-scale').textContent = 'X: -, Y: -, Z: -';
    document.getElementById('editable-properties').innerHTML = '';
    document.getElementById('save-properties').style.display = 'none';
    updateDragInfo('대기 중', null, null, '-');

    // 선택 상태 표시 업데이트
    const colorStatus = document.getElementById('color-status');
    if (colorStatus) {
        colorStatus.textContent = '⚠ 요소를 먼저 선택해주세요';
        colorStatus.style.color = '#dc3545';
    }
}

// IFC 모델 로드 공통 함수
function loadIFCModel(url, fileName = 'IFC 파일') {
    // 기존 모델 제거
    scene.children.forEach((child) => {
        if (child.modelID !== undefined) {
            scene.remove(child);
            ifcLoader.ifcManager.close(child.modelID);
        }
    });

    clearSelection();

    // 모델 로드 시작 상태 표시
    const statusEl = document.getElementById('model-load-status');
    if (statusEl) statusEl.textContent = '로딩 중...';

    ifcLoader.load(
        url,
        // onLoad 콜백
        async(ifcModel) => {
            scene.add(ifcModel);

            const modelID = ifcModel.modelID;

            // IFC 모델 캐시에 저장 (시뮬레이션용)
            ifcModels.set(modelID, ifcModel);

            console.log('IFC 파일 로드 완료:', fileName);
            console.log('ModelID:', modelID);

            // 모델을 중앙에 배치하기 위해 바운딩 박스 계산
            const box = new THREE.Box3().setFromObject(ifcModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            console.log('모델 중심:', center);
            console.log('모델 크기:', size);

            // 웹페이지에 모델 정보 표시
            updateModelInfo(fileName, modelID, center, size);

            // IFC 데이터 요약 생성 및 표시 (비동기 처리)
            setTimeout(() => {
                generateModelSummary(modelID, fileName);
            }, 500);

            // 카메라 위치 조정
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.5; // 여유 공간 추가

            camera.position.set(
                center.x + cameraZ * 0.7,
                center.y + cameraZ * 0.7,
                center.z + cameraZ * 0.7
            );
            camera.lookAt(center);

            // OrbitControls 타겟을 모델 중심으로 설정
            controls.target.copy(center);
            controls.update();

            // 로드 완료 메시지
            document.getElementById('selected-element-id').textContent =
                `IFC 파일 로드 완료 - 요소를 클릭하여 속성을 확인하세요`;

            // 시뮬레이션 컨트롤러에 ModelID 알림
            if (window.simulationController) {
                window.simulationController.modelID = modelID;
                console.log('시뮬레이션 컨트롤러에 ModelID 설정:', modelID);
            }

            // 시뮬레이션 데이터 기본값 자동 생성
            generateDefaultSimulationData(modelID);
        },
        // onProgress 콜백 (선택적)
        (progress) => {
            if (progress.lengthComputable) {
                const percentComplete = (progress.loaded / progress.total) * 100;
                console.log(`IFC 파일 로드 진행률: ${percentComplete.toFixed(1)}%`);
                // 웹페이지에 진행률 표시
                const statusEl = document.getElementById('model-load-status');
                if (statusEl) {
                    statusEl.textContent = `로딩 중... ${percentComplete.toFixed(1)}%`;
                }
            }
        },
        // onError 콜백
        (error) => {
            console.error('IFC 파일 로드 실패:', error);
            alert('IFC 파일 로드에 실패했습니다: ' + (error.message || error));
        }
    );
}

// URL에서 직접 IFC 파일 로드
export function loadIFCFromURL(url, fileName) {
    if (!url) return;
    loadIFCModel(url, fileName || 'IFC 파일');
}

// File 객체에서 IFC 파일 로드
export function loadIFC(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = event.target.result;
            const blob = new Blob([data], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);

            loadIFCModel(url, file.name);

            // Blob URL 정리 (로드 완료 후)
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        } catch (error) {
            console.error('IFC 파일 읽기 실패:', error);
            alert('IFC 파일 읽기에 실패했습니다: ' + error.message);
        }
    };

    reader.readAsArrayBuffer(file);
}

// 색상 적용
export function applyColor(color) {
    console.log('색상 적용 시도 - selectedElement:', selectedElement, 'selectedMesh:', selectedMesh);

    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.\n3D 뷰어에서 요소를 클릭하여 선택하세요.');
        return;
    }

    const { modelID, expressID } = selectedElement;

    // ExpressID가 -1인 경우 (임시 선택) 처리
    if (expressID === -1) {
        console.warn('ExpressID가 없어 메시에 직접 색상 적용');
        try {
            selectedMesh.material = new THREE.MeshLambertMaterial({
                color: color
            });
            console.log('색상 변경 완료 (직접 적용):', color);
            return;
        } catch (error) {
            console.error('색상 적용 실패:', error);
            alert('색상 적용에 실패했습니다: ' + error.message);
            return;
        }
    }

    try {
        // 서브셋 생성하여 색상 변경
        ifcLoader.ifcManager.createSubset({
            modelID,
            ids: [expressID],
            material: new THREE.MeshLambertMaterial({
                color: color,
                transparent: false
            }),
            scene,
            removePrevious: true
        });

        // 선택된 메시의 재질도 업데이트
        if (selectedMesh) {
            selectedMesh.material = new THREE.MeshLambertMaterial({
                color: color
            });
        }

        console.log('색상 변경 완료:', color);
        console.log('ExpressID:', expressID);

        // 성공 메시지 표시
        const statusMsg = document.getElementById('selected-element-id');
        if (statusMsg) {
            const originalText = statusMsg.textContent;
            statusMsg.textContent = `색상 변경 완료: ${color}`;
            setTimeout(() => {
                statusMsg.textContent = originalText;
            }, 2000);
        }
    } catch (error) {
        console.error('색상 적용 실패:', error);
        alert('색상 적용에 실패했습니다: ' + error.message);
    }
}

// 색상 초기화
export function resetColor() {
    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.');
        return;
    }

    const { modelID, expressID } = selectedElement;

    try {
        // 서브셋 제거
        ifcLoader.ifcManager.removeSubset(modelID, [expressID], scene);

        // 원본 재질 복원
        if (originalMaterial) {
            selectedMesh.material = originalMaterial;
        }
    } catch (error) {
        console.error('색상 초기화 실패:', error);
        alert('색상 초기화에 실패했습니다: ' + error.message);
    }
}

// 위치 적용
export function applyPosition(x, y, z) {
    console.log('위치 적용 시도 - selectedElement:', selectedElement, 'selectedMesh:', selectedMesh);

    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.\n3D 뷰어에서 요소를 클릭하여 선택하세요.');
        return;
    }

    try {
        // 선택된 메시의 위치 변경
        selectedMesh.position.set(x, y, z);

        // 하이라이트 메시 위치도 업데이트
        if (highlightMesh) {
            highlightMesh.position.set(x, y, z);
        }

        console.log('위치 변경 완료:', { x, y, z });
        console.log('ExpressID:', selectedElement.expressID);

        // 웹페이지 정보 업데이트
        if (selectedElement) {
            updateElementInfo(selectedElement.modelID, selectedElement.expressID, selectedMesh);
        }

        // 성공 메시지 표시
        const statusMsg = document.getElementById('selected-element-id');
        if (statusMsg) {
            const originalText = statusMsg.textContent;
            statusMsg.textContent = `위치 변경 완료: X=${x}, Y=${y}, Z=${z}`;
            setTimeout(() => {
                statusMsg.textContent = originalText;
            }, 2000);
        }
    } catch (error) {
        console.error('위치 적용 실패:', error);
        alert('위치 적용에 실패했습니다: ' + error.message);
    }
}

// 위치 초기화
export function resetPosition() {
    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.');
        return;
    }

    try {
        // 위치를 원래대로 복원
        selectedMesh.position.set(0, 0, 0);
        // 웹페이지 정보 업데이트
        if (selectedElement) {
            updateElementInfo(selectedElement.modelID, selectedElement.expressID, selectedMesh);
        }
    } catch (error) {
        console.error('위치 초기화 실패:', error);
        alert('위치 초기화에 실패했습니다: ' + error.message);
    }
}

// ==================== 시뮬레이터 데이터 연동 기능 ====================

// ExpressID로 메시 찾기 (시뮬레이션용)
function findMeshByExpressID(modelID, expressID) {
    // IFC 모델 찾기
    let ifcModel = ifcModels.get(modelID);
    if (!ifcModel) {
        // 씬에서 찾기
        scene.traverse((child) => {
            if (child.modelID === modelID) {
                ifcModel = child;
                ifcModels.set(modelID, child);
            }
        });
    }

    if (!ifcModel) {
        console.warn(`ModelID ${modelID}를 찾을 수 없습니다.`);
        return null;
    }

    // geometry의 expressID 속성에서 찾기
    let foundMesh = null;

    ifcModel.traverse((child) => {
        if (foundMesh) return; // 이미 찾았으면 중단

        if (child.isMesh && child.geometry) {
            // 옵셔널 체이닝 대신 안전한 접근 방식 사용
            const attributes = child.geometry.attributes;
            const idAttr = attributes && attributes.expressID;
            if (idAttr) {
                // geometry의 expressID 배열에서 찾기
                const idArray = idAttr.array;
                for (let i = 0; i < idArray.length; i++) {
                    if (idArray[i] === expressID) {
                        foundMesh = child;
                        break;
                    }
                }
            }

            // 또는 geometry.groups에서 찾기 (더 정확할 수 있음)
            if (!foundMesh && child.geometry.groups) {
                for (let group of child.geometry.groups) {
                    // group을 통한 ExpressID 찾기 시도
                }
            }
        }
    });

    return foundMesh;
}

// ExpressID로 직접 위치 적용 (시뮬레이션용)
export function applyPositionToElement(modelID, expressID, x, y, z) {
    try {
        const mesh = findMeshByExpressID(modelID, expressID);
        if (mesh) {
            mesh.position.set(x, y, z);
            console.log(`위치 적용 완료 - ExpressID: ${expressID}, 위치: (${x}, ${y}, ${z})`);
            return true;
        } else {
            console.warn(`ExpressID ${expressID}에 해당하는 메시를 찾을 수 없습니다.`);
            // createSubset으로 요소를 생성하여 시도
            return false;
        }
    } catch (error) {
        console.error('위치 적용 실패:', error);
        return false;
    }
}

// ExpressID로 직접 색상 적용 (시뮬레이션용)
export function applyColorToElement(modelID, expressID, color) {
    try {
        ifcLoader.ifcManager.createSubset({
            modelID,
            ids: [expressID],
            material: new THREE.MeshLambertMaterial({
                color: color,
                transparent: false
            }),
            scene,
            removePrevious: true
        });
        console.log(`색상 적용 완료 - ExpressID: ${expressID}, 색상: ${color}`);
        return true;
    } catch (error) {
        console.error('색상 적용 실패:', error);
        return false;
    }
}

// ExpressID로 요소 가시성 제어 (시뮬레이션용)
export function setElementVisibility(modelID, expressID, visible) {
    try {
        const mesh = findMeshByExpressID(modelID, expressID);
        if (mesh) {
            mesh.visible = visible;
            console.log(`가시성 변경 - ExpressID: ${expressID}, visible: ${visible}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('가시성 변경 실패:', error);
        return false;
    }
}

// ExpressID로 회전 적용 (시뮬레이션용)
export function applyRotationToElement(modelID, expressID, rx, ry, rz) {
    try {
        const mesh = findMeshByExpressID(modelID, expressID);
        if (mesh) {
            mesh.rotation.set(rx, ry, rz);
            console.log(`회전 적용 완료 - ExpressID: ${expressID}, 회전: (${rx}, ${ry}, ${rz})`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('회전 적용 실패:', error);
        return false;
    }
}

// ExpressID로 스케일 적용 (시뮬레이션용)
export function applyScaleToElement(modelID, expressID, sx, sy, sz) {
    try {
        const mesh = findMeshByExpressID(modelID, expressID);
        if (mesh) {
            mesh.scale.set(sx, sy, sz);
            console.log(`스케일 적용 완료 - ExpressID: ${expressID}, 스케일: (${sx}, ${sy}, ${sz})`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('스케일 적용 실패:', error);
        return false;
    }
}

// 현재 로드된 모델의 ModelID 반환
export function getCurrentModelID() {
    // 먼저 캐시에서 찾기 (0도 유효한 ModelID)
    if (ifcModels.size > 0) {
        for (let [modelID, model] of ifcModels) {
            // 0도 유효한 ModelID이므로 null/undefined만 체크
            if (modelID !== undefined && modelID !== null) {
                console.log('캐시에서 ModelID 발견:', modelID);
                return modelID; // 0을 포함한 모든 숫자 반환
            }
        }
    }

    // 씬에서 찾기
    let foundModelID = null;
    scene.traverse((child) => {
        if (child.modelID !== undefined && child.modelID !== null && !foundModelID) {
            foundModelID = child.modelID;
            ifcModels.set(foundModelID, child);
            console.log('씬에서 ModelID 발견:', foundModelID);
        }
    });

    if (!foundModelID) {
        console.warn('ModelID를 찾을 수 없습니다. IFC 모델이 로드되었는지 확인하세요.');
    }

    return foundModelID;
}

// 기본 시뮬레이션 데이터 자동 생성
function generateDefaultSimulationData(modelID) {
    // IFC 파일에서 요소 찾기 시도
    setTimeout(async() => {
        try {
            // 씬에서 첫 번째 요소 찾기
            let firstElementId = null;
            let firstPosition = { x: 1, y: 0, z: 0 }; // 기본값

            const ifcModel = ifcModels.get(modelID);
            if (ifcModel) {
                ifcModel.traverse((child) => {
                    if (child.isMesh && child.geometry && !firstElementId) {
                        const attributes = child.geometry.attributes;
                        const idAttr = attributes && attributes.expressID;
                        if (idAttr && idAttr.array && idAttr.array.length > 0) {
                            firstElementId = idAttr.array[0];
                            // 위치 가져오기
                            if (child.position) {
                                firstPosition = {
                                    x: child.position.x,
                                    y: child.position.y,
                                    z: child.position.z
                                };
                            }
                        }
                    }
                });
            }

            // ExpressID를 찾지 못한 경우 기본값 사용 (tessellated-item.ifc 기준)
            if (!firstElementId) {
                firstElementId = 1000; // tessellated-item.ifc의 ExpressID
            }

            // 기본 시뮬레이션 데이터 생성
            const defaultData = [{
                    time: 0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x, y: firstPosition.y, z: firstPosition.z },
                    color: "#ffffff"
                },
                {
                    time: 1.0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x + 1, y: firstPosition.y, z: firstPosition.z },
                    color: "#ff0000"
                },
                {
                    time: 2.0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x + 2, y: firstPosition.y + 1, z: firstPosition.z },
                    color: "#00ff00"
                },
                {
                    time: 3.0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x + 2, y: firstPosition.y + 2, z: firstPosition.z },
                    color: "#0000ff"
                },
                {
                    time: 4.0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x + 1, y: firstPosition.y + 1, z: firstPosition.z },
                    color: "#ffff00"
                },
                {
                    time: 5.0,
                    elementId: firstElementId,
                    position: { x: firstPosition.x, y: firstPosition.y, z: firstPosition.z },
                    color: "#ffffff"
                }
            ];

            // 텍스트 영역에 자동 입력
            const simDataInput = document.getElementById('sim-data-input');
            if (simDataInput) {
                simDataInput.value = JSON.stringify(defaultData, null, 2);
                console.log('기본 시뮬레이션 데이터 생성 완료 (ExpressID:', firstElementId + ')');
            }
        } catch (error) {
            console.warn('기본 시뮬레이션 데이터 생성 실패:', error);
        }
    }, 1000); // 모델 로드 후 1초 대기
}

// IFC 모델 데이터 요약 생성
async function generateModelSummary(modelID, fileName) {
    try {
        console.log('IFC 모델 요약 생성 시작...');

        const summary = {
            fileName: fileName,
            modelID: modelID,
            spatialStructure: null,
            elementCounts: {},
            fileInfo: {}
        };

        // 1. 공간 구조 가져오기 (Project -> Site -> Building -> Storeys)
        try {
            summary.spatialStructure = await ifcLoader.ifcManager.getSpatialStructure(modelID, true);
            console.log('공간 구조:', summary.spatialStructure);
        } catch (error) {
            console.warn('공간 구조 가져오기 실패:', error);
        }

        // 2. 주요 요소 타입별 개수 계산
        const elementTypes = [
            { name: '벽 (Walls)', type: 'IFCWALLSTANDARDCASE' },
            { name: '문 (Doors)', type: 'IFCDOORSTANDARDCASE' },
            { name: '창문 (Windows)', type: 'IFCWINDOWSTANDARDCASE' },
            { name: '슬래브 (Slabs)', type: 'IFCSLABSTANDARDCASE' },
            { name: '기둥 (Columns)', type: 'IFCCOLUMNSTANDARDCASE' },
            { name: '보 (Beams)', type: 'IFCBEAMSTANDARDCASE' },
            { name: '개구부 (Openings)', type: 'IFCOPENINGELEMENT' },
            { name: '공간 (Spaces)', type: 'IFCSPACE' },
        ];

        for (const elemType of elementTypes) {
            try {
                const items = await ifcLoader.ifcManager.byType(modelID, elemType.type);
                summary.elementCounts[elemType.name] = items ? items.length : 0;
            } catch (error) {
                console.warn(`${elemType.name} 개수 가져오기 실패:`, error);
                summary.elementCounts[elemType.name] = 0;
            }
        }

        // 3. 파일 헤더 정보 가져오기
        try {
            const fileNameHeader = await ifcLoader.ifcManager.properties.getHeaderLine(modelID, 1);
            summary.fileInfo = {
                fileName: fileNameHeader ? fileNameHeader.value : fileName,
                timeStamp: fileNameHeader ? .value ? .timeStamp || '',
                author: fileNameHeader ? .value ? .author || '',
                organization: fileNameHeader ? .value ? .organization || '',
            };
        } catch (error) {
            console.warn('파일 헤더 정보 가져오기 실패:', error);
        }

        // 4. 총 요소 개수 계산
        const totalElements = Object.values(summary.elementCounts).reduce((sum, count) => sum + count, 0);
        summary.totalElements = totalElements;

        console.log('모델 요약:', summary);

        // 5. 웹페이지에 요약 표시
        displayModelSummary(summary);

    } catch (error) {
        console.error('모델 요약 생성 실패:', error);
    }
}

// 모델 요약을 웹페이지에 표시
function displayModelSummary(summary) {
    const summaryPanel = document.getElementById('model-summary-panel');
    if (!summaryPanel) {
        console.warn('model-summary-panel 요소를 찾을 수 없습니다.');
        return;
    }

    let html = '<h2>📊 IFC 모델 데이터 요약</h2>';

    // 파일 정보
    html += '<div class="summary-section">';
    html += '<h3>📁 파일 정보</h3>';
    html += `<p><strong>파일명:</strong> ${summary.fileName}</p>`;
    html += `<p><strong>ModelID:</strong> ${summary.modelID}</p>`;
    if (summary.fileInfo.timeStamp) {
        html += `<p><strong>생성 시간:</strong> ${summary.fileInfo.timeStamp}</p>`;
    }
    html += '</div>';

    // 공간 구조
    if (summary.spatialStructure) {
        html += '<div class="summary-section">';
        html += '<h3>🏢 공간 구조</h3>';

        const project = summary.spatialStructure;
        if (project) {
            html += `<p><strong>프로젝트:</strong> ${project.Name || project.type || 'N/A'}</p>`;

            if (project.children && project.children.length > 0) {
                project.children.forEach((site, siteIdx) => {
                    html += `<p style="margin-left: 20px;"><strong>Site ${siteIdx + 1}:</strong> ${site.Name || site.type || 'N/A'}</p>`;

                    if (site.children && site.children.length > 0) {
                        site.children.forEach((building, bldIdx) => {
                            html += `<p style="margin-left: 40px;"><strong>Building ${bldIdx + 1}:</strong> ${building.Name || building.type || 'N/A'}</p>`;

                            if (building.children && building.children.length > 0) {
                                building.children.forEach((storey, storeyIdx) => {
                                    html += `<p style="margin-left: 60px;">└ <strong>Storey ${storeyIdx + 1}:</strong> ${storey.Name || storey.type || 'N/A'}</p>`;
                                });
                            }
                        });
                    }
                });
            }
        }

        html += '</div>';
    }

    // 요소 개수 통계
    html += '<div class="summary-section">';
    html += '<h3>📈 요소 통계</h3>';
    html += `<p><strong>총 요소 개수:</strong> <span style="color: #007bff; font-weight: bold; font-size: 1.2em;">${summary.totalElements}</span></p>`;
    html += '<table class="summary-table">';
    html += '<thead><tr><th>요소 유형</th><th>개수</th></tr></thead>';
    html += '<tbody>';

    Object.entries(summary.elementCounts)
        .sort((a, b) => b[1] - a[1]) // 개수 순으로 정렬
        .forEach(([name, count]) => {
            if (count > 0) {
                html += `<tr><td>${name}</td><td style="text-align: right; font-weight: bold;">${count}</td></tr>`;
            }
        });

    html += '</tbody></table>';
    html += '</div>';

    summaryPanel.innerHTML = html;
    summaryPanel.style.display = 'block';
}

// 윈도우 리사이즈 처리
function onWindowResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);

    // OrbitControls도 업데이트
    controls.handleResize();
}

// 마우스 다운 이벤트 (드래그 시작)
function onMouseDown(event) {
    // 마우스 다운 시간과 위치를 항상 기록 (클릭 판단용)
    const rect = renderer.domElement.getBoundingClientRect();
    mouseDownPosition.set(event.clientX - rect.left, event.clientY - rect.top);
    mouseDownTime = Date.now();

    // 요소가 선택되어 있고 우클릭이 아닐 때만 OrbitControls 비활성화
    if (selectedMesh && event.button !== 2) {
        controls.enabled = false;
    }

    if (!selectedMesh) {
        console.log('마우스 다운 - 선택된 메시 없음');
        return;
    }

    dragStart.x = event.clientX - rect.left;
    dragStart.y = event.clientY - rect.top;
    dragStartPosition.copy(selectedMesh.position);

    // 드래그 평면 설정 (카메라를 향한 평면)
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, selectedMesh.position);

    isDragging = false; // 아직 드래그가 아닐 수 있음

    console.log('=== 마우스 다운 ===');
    console.log('선택된 메시 위치:', dragStartPosition);
    console.log('마우스 위치:', dragStart.x, dragStart.y);
    updateDragInfo('준비', dragStartPosition, null, '-');
}

// 마우스 이동 이벤트 (드래그 중)
function onMouseMove(event) {
    if (!selectedMesh) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 마우스가 충분히 움직였는지 확인 (드래그 시작)
    const mouseDelta = Math.sqrt(
        Math.pow(mouseX - mouseDownPosition.x, 2) +
        Math.pow(mouseY - mouseDownPosition.y, 2)
    );

    // 드래그 시작 판단: 20px 이상 이동해야 드래그로 인정
    if (mouseDelta > 20 && !isDragging) {
        // 드래그 시작
        isDragging = true;
        console.log('=== 드래그 시작 ===');
        console.log('시작 위치:', dragStartPosition);
        console.log('마우스 이동 거리:', mouseDelta.toFixed(2), 'px');
        updateDragInfo('드래그 중', dragStartPosition, null, '0.00');
    }

    if (isDragging) {
        // 마우스 위치를 정규화된 좌표로 변환
        mouse.x = ((mouseX / rect.width) * 2 - 1);
        mouse.y = -((mouseY / rect.height) * 2 + 1);

        // 레이캐스터로 드래그 평면과의 교차점 계산
        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(dragPlane, dragIntersection);

        if (dragIntersection) {
            // 메시 위치 업데이트
            selectedMesh.position.copy(dragIntersection);

            // 하이라이트 메시 위치도 업데이트
            if (highlightMesh) {
                highlightMesh.position.copy(selectedMesh.position);
                highlightMesh.rotation.copy(selectedMesh.rotation);
            }

            // 로그 출력 및 웹페이지 업데이트 (throttle 적용)
            if (!onMouseMove.lastLog || Date.now() - onMouseMove.lastLog > 100) {
                const distance = dragStartPosition.distanceTo(selectedMesh.position);
                console.log('=== 드래그 중 ===');
                console.log('현재 위치:', {
                    x: selectedMesh.position.x.toFixed(2),
                    y: selectedMesh.position.y.toFixed(2),
                    z: selectedMesh.position.z.toFixed(2)
                });
                console.log('이동 거리:', distance.toFixed(2));
                console.log('마우스 이동:', mouseDelta.toFixed(2), 'px');

                // 웹페이지 업데이트
                updateDragInfo('드래그 중', dragStartPosition, selectedMesh.position, distance);
                updateElementInfo(selectedElement.modelID, selectedElement.expressID, selectedMesh);

                // 위치 입력 필드에 현재 위치 실시간 반영
                const posXInput = document.getElementById('pos-x');
                const posYInput = document.getElementById('pos-y');
                const posZInput = document.getElementById('pos-z');
                if (posXInput) posXInput.value = selectedMesh.position.x.toFixed(2);
                if (posYInput) posYInput.value = selectedMesh.position.y.toFixed(2);
                if (posZInput) posZInput.value = selectedMesh.position.z.toFixed(2);

                onMouseMove.lastLog = Date.now();
            }
        }
    }
}

// 마우스 업 이벤트 (드래그 종료)
function onMouseUp(event) {
    if (isDragging && selectedMesh) {
        const finalDistance = dragStartPosition.distanceTo(selectedMesh.position);
        console.log('=== 드래그 종료 ===');
        console.log('최종 위치:', {
            x: selectedMesh.position.x.toFixed(2),
            y: selectedMesh.position.y.toFixed(2),
            z: selectedMesh.position.z.toFixed(2)
        });
        console.log('시작 위치:', {
            x: dragStartPosition.x.toFixed(2),
            y: dragStartPosition.y.toFixed(2),
            z: dragStartPosition.z.toFixed(2)
        });
        console.log('총 이동 거리:', finalDistance.toFixed(2));
        console.log('이동 벡터:', {
            x: (selectedMesh.position.x - dragStartPosition.x).toFixed(2),
            y: (selectedMesh.position.y - dragStartPosition.y).toFixed(2),
            z: (selectedMesh.position.z - dragStartPosition.z).toFixed(2)
        });
        console.log('==================');

        // 웹페이지 업데이트
        updateDragInfo('완료', dragStartPosition, selectedMesh.position, finalDistance);
        updateElementInfo(selectedElement.modelID, selectedElement.expressID, selectedMesh);

        // 위치 입력 필드에 최종 위치 반영
        const posXInput = document.getElementById('pos-x');
        const posYInput = document.getElementById('pos-y');
        const posZInput = document.getElementById('pos-z');
        if (posXInput) posXInput.value = selectedMesh.position.x.toFixed(2);
        if (posYInput) posYInput.value = selectedMesh.position.y.toFixed(2);
        if (posZInput) posZInput.value = selectedMesh.position.z.toFixed(2);
    }

    // OrbitControls 다시 활성화 (드래그 종료 시)
    controls.enabled = true;
    isDragging = false;
}

// 이벤트 리스너 등록
renderer.domElement.addEventListener('click', onMouseClick);
renderer.domElement.addEventListener('mousedown', onMouseDown);
renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('mouseup', onMouseUp);
window.addEventListener('resize', onWindowResize);

// 애니메이션 루프
function animate() {
    requestAnimationFrame(animate);

    // OrbitControls 업데이트 (부드러운 감속 효과를 위해 필요)
    controls.update();

    renderer.render(scene, camera);
}

animate();