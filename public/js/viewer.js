import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { IFCLoader } from 'https://unpkg.com/web-ifc-three@0.0.126/IFCLoader.js';

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
ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.126/');

// 레이캐스터 및 마우스 설정
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 선택된 요소 정보
let selectedElement = null;
let selectedMesh = null;
let originalMaterial = null;

// 마우스 클릭 이벤트 처리
function onMouseClick(event) {
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
  
  // 원본 재질 저장
  if (mesh.material) {
    originalMaterial = mesh.material.clone();
  }
  
  // 선택된 요소 ID 표시
  document.getElementById('selected-element-id').textContent = `ExpressID: ${expressID}`;
  
  // 속성 조회
  ifcLoader.ifcManager.getItemProperties(modelID, expressID)
    .then((properties) => {
      // 모든 속성 변수를 JSON으로 표시
      const propertiesText = JSON.stringify(properties, null, 2);
      document.getElementById('element-properties').textContent = propertiesText;
      
      // 콘솔에도 출력하여 디버깅 가능하도록
      console.log('선택된 요소 속성:', properties);
      console.log('ExpressID:', expressID);
      console.log('ModelID:', modelID);
    })
    .catch((error) => {
      console.error('속성 조회 실패:', error);
      document.getElementById('element-properties').textContent = 
        `오류: ${error.message}`;
    });
}

// 선택 해제
function clearSelection() {
  if (selectedMesh && originalMaterial) {
    selectedMesh.material = originalMaterial;
  }
  
  selectedElement = null;
  selectedMesh = null;
  originalMaterial = null;
  
  document.getElementById('selected-element-id').textContent = '없음';
  document.getElementById('element-properties').textContent = '없음';
}

// IFC 파일 로드
export function loadIFC(file) {
  if (!file) return;
  
  // 기존 모델 제거
  scene.children.forEach((child) => {
    if (child.modelID !== undefined) {
      scene.remove(child);
      ifcLoader.ifcManager.close(child.modelID);
    }
  });
  
  clearSelection();
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = event.target.result;
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      ifcLoader.load(url, (ifcModel) => {
        scene.add(ifcModel);
        
        const modelID = ifcModel.modelID;
        console.log('IFC 파일 로드 완료:', file.name);
        console.log('ModelID:', modelID);
        
        // 모델을 중앙에 배치하기 위해 바운딩 박스 계산
        const box = new THREE.Box3().setFromObject(ifcModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        console.log('모델 중심:', center);
        console.log('모델 크기:', size);
        
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
        
        URL.revokeObjectURL(url);
        
        // 로드 완료 메시지
        document.getElementById('selected-element-id').textContent = 
          `IFC 파일 로드 완료 - 요소를 클릭하여 속성을 확인하세요`;
      }, (error) => {
        console.error('IFC 파일 로드 실패:', error);
        alert('IFC 파일 로드에 실패했습니다: ' + (error.message || error));
        URL.revokeObjectURL(url);
      });
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

// 이벤트 리스너 등록
renderer.domElement.addEventListener('click', onMouseClick);
window.addEventListener('resize', onWindowResize);

// 애니메이션 루프
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();

