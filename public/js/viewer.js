import * as THREE from 'three';
// 로컬에 설치된 web-ifc-three 사용
import { IFCLoader } from '/js/IFCLoader.js';

// Three.js 장면 설정
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

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
    // 드래그 중이면 클릭 이벤트 무시
    if (isDragging) {
        return;
    }

    // 짧은 클릭인지 확인 (200ms 이내, 5px 이내 이동)
    const clickDuration = Date.now() - mouseDownTime;
    const clickDistance = Math.sqrt(
        Math.pow(event.clientX - mouseDownPosition.x, 2) +
        Math.pow(event.clientY - mouseDownPosition.y, 2)
    );

    if (clickDuration > 200 || clickDistance > 5) {
        return; // 드래그로 간주
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 모든 메시를 검사
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

        // IFC 모델인지 확인
        if (object.modelID !== undefined) {
            const modelID = object.modelID;
            const expressID = ifcLoader.ifcManager.getExpressId(
                object.geometry,
                intersect.faceIndex
            );

            selectElement(modelID, expressID, object);
        }
    } else {
        // 아무것도 선택되지 않음
        clearSelection();
    }
}

// 요소 선택
function selectElement(modelID, expressID, mesh) {
    // 이전 선택 해제
    clearSelection();

    selectedElement = { modelID, expressID };
    selectedMesh = mesh;

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

    // 선택된 요소 정보 로그 출력 및 웹페이지 표시
    console.log('=== 요소 선택 ===');
    console.log('ExpressID:', expressID);
    console.log('ModelID:', modelID);
    console.log('메시 위치:', mesh.position);
    console.log('메시 회전:', mesh.rotation);
    console.log('메시 크기:', mesh.scale);

    // 웹페이지에 정보 표시
    updateElementInfo(modelID, expressID, mesh);

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

    ifcLoader.load(
        url,
        // onLoad 콜백
        (ifcModel) => {
            scene.add(ifcModel);

            const modelID = ifcModel.modelID;
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

            // 로드 완료 메시지
            document.getElementById('selected-element-id').textContent =
                `IFC 파일 로드 완료 - 요소를 클릭하여 속성을 확인하세요`;
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
    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.');
        return;
    }

    const { modelID, expressID } = selectedElement;

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
    if (!selectedElement || !selectedMesh) {
        alert('먼저 요소를 선택해주세요.');
        return;
    }

    try {
        // 선택된 메시의 위치 변경
        selectedMesh.position.set(x, y, z);
        // 웹페이지 정보 업데이트
        if (selectedElement) {
            updateElementInfo(selectedElement.modelID, selectedElement.expressID, selectedMesh);
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

// 윈도우 리사이즈 처리
function onWindowResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// 마우스 다운 이벤트 (드래그 시작)
function onMouseDown(event) {
    if (!selectedMesh) return;

    const rect = renderer.domElement.getBoundingClientRect();
    dragStart.x = event.clientX - rect.left;
    dragStart.y = event.clientY - rect.top;
    mouseDownPosition.set(dragStart.x, dragStart.y);
    mouseDownTime = Date.now();
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

    if (mouseDelta > 5 && !isDragging) {
        // 드래그 시작
        isDragging = true;
        console.log('=== 드래그 시작 ===');
        console.log('시작 위치:', dragStartPosition);
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
    }
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
    renderer.render(scene, camera);
}

animate();